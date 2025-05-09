# fft_server.py - REST API for FFT Analysis on Raspberry Pi
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import time
import numpy as np
from scipy.signal import find_peaks
import json

app = Flask(__name__)
CORS(app)  # Enable CORS for cross-platform requests

# Class to manage FFT analysis in the background
class FFTAnalysisManager:
    def __init__(self):
        # Data storage
        self.data = []
        self.peak_data = []
        self.frequency_data = []
        self.magnitude_data = []
        self.running = False
        self.lock = threading.Lock()
        
        # Default values
        self.N = 1000
        self.base_freq = 10.0
        self.noise_level = 0.1
        self.sample_rate = 500  # Samples per second
        
        # Time counter for continuous simulation
        self.time_counter = 0
        
        # Additional data for mobile app
        self.max_voltage = 0
        self.total_power = 0
        self.timestamp = 0
    
    def generate_signal(self, t):
        """Generate a synthetic signal with multiple frequency components and noise"""
        # Create a signal with cleaner frequency components to make peaks distinct
        signal = (
            np.sin(2 * np.pi * self.base_freq * t) +                   # Base frequency
            0.5 * np.sin(2 * np.pi * (2 * self.base_freq) * t) +       # 2nd harmonic
            0.3 * np.sin(2 * np.pi * (3 * self.base_freq) * t) +       # 3rd harmonic
            0.2 * np.sin(2 * np.pi * (self.base_freq / 2) * t)         # Subharmonic
        )
        
        # Add some random noise (reduced noise for clearer peaks)
        noise = np.random.normal(0, self.noise_level * 0.8, len(t))
        
        # Add a slow drift to simulate DC offset changes
        drift = 0.2 * np.sin(2 * np.pi * 0.05 * t)
        
        return signal + noise + drift
    
    def run_analysis(self):
        """Run the FFT analysis with simulated data"""
        try:
            dt = 1.0 / self.sample_rate  # Time step
            
            # Main analysis loop
            while self.running:
                t0 = time.time()
                
                # Generate time points
                t = np.arange(self.time_counter, self.time_counter + self.N * dt, dt)[:self.N]
                
                # Generate synthetic signal
                time_data = self.generate_signal(t)
                
                # Calculate FFT
                FFT = np.abs(np.fft.fft(time_data)) / self.N
                
                # Convert to single sided magnitude
                V1 = FFT[0:int(self.N/2+1)]
                V1[1:-2] = 2 * V1[1:-2]
                
                # Create frequency axis (x-axis for frequency domain)
                freq = self.sample_rate / self.N * np.arange(int(self.N/2+1))
                
                # Only show frequencies up to max_plot_freq
                max_plot_freq = 100  # Only show up to 100 Hz for better visibility
                
                if freq[-1] > max_plot_freq:
                    max_freq_idx = np.where(freq > max_plot_freq)[0][0]
                    plot_freq = freq[:max_freq_idx]
                    plot_V1 = V1[:max_freq_idx]
                else:
                    plot_freq = freq
                    plot_V1 = V1
                
                # Find peaks in the frequency domain
                peak_indices, peak_properties = find_peaks(plot_V1, height=0.1, distance=5, prominence=0.05, width=1)
                
                # If no peaks were found with the stricter criteria, try more lenient settings
                if len(peak_indices) == 0:
                    peak_indices, peak_properties = find_peaks(plot_V1, height=0.03, distance=3, prominence=0.02, width=1)
                
                # Window size for finding true peak maximum
                window_size = 8
                
                # Clear peak data
                peak_data = []
                
                # Identify each peak
                for peak_idx in peak_indices:
                    # Find true maximum within window
                    left_bound = max(0, peak_idx - window_size)
                    right_bound = min(len(plot_freq) - 1, peak_idx + window_size)
                    
                    window_data = plot_V1[left_bound:right_bound+1]
                    local_max_idx = np.argmax(window_data) + left_bound
                    
                    # Get peak frequency and magnitude
                    freq_val = plot_freq[local_max_idx]
                    mag_val = plot_V1[local_max_idx]
                    
                    # Store peak data
                    peak_data.append({"frequency": float(freq_val), "magnitude": float(mag_val)})
                
                # Calculate total peak voltage
                max_voltage = np.max(np.abs(time_data))
                
                # Calculate total power (sum of squares of magnitude components)
                total_power = np.sum(np.square(plot_V1))
                
                # Update the data with lock to avoid race conditions
                with self.lock:
                    self.data = time_data.tolist()
                    self.peak_data = peak_data
                    self.frequency_data = plot_freq.tolist()
                    self.magnitude_data = plot_V1.tolist()
                    self.max_voltage = float(max_voltage)
                    self.total_power = float(total_power)
                    self.timestamp = time.time()
                
                # Increment time counter for continuous data
                self.time_counter += self.N * dt
                
                # Measure actual processing time
                processing_time = time.time() - t0
                
                # Wait if processing was faster than desired update rate
                target_update_time = 0.2  # Update every 200ms
                if processing_time < target_update_time:
                    time.sleep(target_update_time - processing_time)
        
        except Exception as e:
            print(f"Error in analysis: {e}")
            import traceback
            traceback.print_exc()
            self.running = False
    
    def start(self):
        """Start the FFT analysis in a background thread"""
        if not self.running:
            self.running = True
            self.analysis_thread = threading.Thread(target=self.run_analysis)
            self.analysis_thread.daemon = True
            self.analysis_thread.start()
            return True
        return False
    
    def stop(self):
        """Stop the FFT analysis"""
        if self.running:
            self.running = False
            if hasattr(self, 'analysis_thread') and self.analysis_thread.is_alive():
                self.analysis_thread.join(timeout=1.0)
            return True
        return False
    
    def get_data(self):
        """Get the current FFT data"""
        with self.lock:
            return {
                "timestamp": self.timestamp,
                "peak_data": self.peak_data,
                "max_voltage": self.max_voltage,
                "total_power": self.total_power,
                "is_running": self.running
            }
    
    def get_raw_data(self):
        """Get detailed frequency and magnitude data for plotting"""
        with self.lock:
            return {
                "timestamp": self.timestamp,
                "frequency_data": self.frequency_data,
                "magnitude_data": self.magnitude_data,
                "time_data": self.data[:100],  # Only send a portion to reduce data size
                "is_running": self.running
            }
    
    def update_settings(self, settings):
        """Update analysis settings"""
        if 'base_freq' in settings:
            self.base_freq = float(settings['base_freq'])
        if 'noise_level' in settings:
            self.noise_level = float(settings['noise_level'])
        return True
    
    

# Create an instance of the FFT analysis manager
fft_manager = FFTAnalysisManager()

# API routes
@app.route('/api/fft/start', methods=['POST'])
def start_analysis():
    """Start the FFT analysis"""
    result = fft_manager.start()
    return jsonify({"success": result, "message": "Analysis started"})

@app.route('/api/fft/stop', methods=['POST'])
def stop_analysis():
    """Stop the FFT analysis"""
    result = fft_manager.stop()
    return jsonify({"success": result, "message": "Analysis stopped"})

@app.route('/api/fft/data', methods=['GET'])
def get_data():
    """Get the current FFT data"""
    data = fft_manager.get_data()
    return jsonify(data)

@app.route('/api/fft/raw', methods=['GET'])
def get_raw_data():
    """Get detailed frequency and magnitude data for plotting"""
    data = fft_manager.get_raw_data()
    return jsonify(data)

@app.route('/api/fft/settings', methods=['POST'])
def update_settings():
    """Update analysis settings"""
    settings = request.get_json()
    result = fft_manager.update_settings(settings)
    return jsonify({"success": result, "message": "Settings updated"})

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get server status"""
    return jsonify({
        "status": "running",
        "analysis_running": fft_manager.running,
        "uptime": time.time(),
        "version": "1.0.0"
    })

if __name__ == '__main__':
    try:
        # Run the server on all interfaces (0.0.0.0) so it's accessible from external devices
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    finally:
        # Make sure analysis is stopped when server stops
        fft_manager.stop()