import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, SafeAreaView, ScrollView } from 'react-native';

// Define types for FFT data
interface PeakData {
  frequency: number;
  magnitude: number;
}

interface FFTData {
  timestamp: number;
  peak_data: PeakData[];
  max_voltage: number;
  total_power: number;
  is_running: boolean;
}

export default function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [ipAddress, setIpAddress] = useState('10.141.192.169');
  const [port, setPort] = useState('5000');
  const [isConnected, setIsConnected] = useState(false);
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [fftData, setFftData] = useState<FFTData | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Test connection to the server
  const testConnection = () => {
    setLoading(true);
    fetch(`http://${ipAddress}:${port}/api/status`)
      .then(response => response.json())
      .then(data => {
        setIsConnected(true);
        setIsAnalysisRunning(data.analysis_running);
        Alert.alert(
          "Connection Successful!",
          `Connected to server version ${data.version}.`,
          [{ text: "OK" }]
        );
      })
      .catch(error => {
        setIsConnected(false);
        Alert.alert(
          "Connection Failed",
          "Error connecting to server. Please check the IP address and port.",
          [{ text: "OK" }]
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };
  
  // Start FFT analysis
  const startAnalysis = () => {
    setLoading(true);
    fetch(`http://${ipAddress}:${port}/api/fft/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsAnalysisRunning(true);
          fetchFFTData();
        } else {
          Alert.alert("Error", "Failed to start analysis");
        }
      })
      .catch(error => {
        Alert.alert("Error", "Network error");
      })
      .finally(() => {
        setLoading(false);
      });
  };
  
  // Stop FFT analysis
  const stopAnalysis = () => {
    setLoading(true);
    fetch(`http://${ipAddress}:${port}/api/fft/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsAnalysisRunning(false);
        } else {
          Alert.alert("Error", "Failed to stop analysis");
        }
      })
      .catch(error => {
        Alert.alert("Error", "Network error");
      })
      .finally(() => {
        setLoading(false);
      });
  };
  
  // Fetch FFT data
  const fetchFFTData = () => {
    fetch(`http://${ipAddress}:${port}/api/fft/data`)
      .then(response => response.json())
      .then(data => {
        setFftData(data);
        setIsAnalysisRunning(data.is_running);
      })
      .catch(error => {
        console.log("Error fetching FFT data");
      });
  };
  
  // Set up a timer to fetch data periodically
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (isConnected && isAnalysisRunning) {
      fetchFFTData();
      timer = setInterval(fetchFFTData, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isConnected, isAnalysisRunning]);
  
  // Welcome screen
  if (showWelcome) {
    return (
      <TouchableOpacity 
        style={styles.welcomeContainer}
        activeOpacity={0.8}
        onPress={() => setShowWelcome(false)}
      >
        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeTitle}>FFT Analyzer</Text>
          <Text style={styles.welcomeSubtitle}>Tap to continue</Text>
        </View>
      </TouchableOpacity>
    );
  }
  
  // If connected, show the FFT analysis screen
  if (isConnected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Volcano Machine</Text>
          <TouchableOpacity 
            style={styles.disconnectButton} 
            onPress={() => setIsConnected(false)}
          >
            <Text style={styles.buttonTextSmall}>Disconnect</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.controlPanel}>
          <TouchableOpacity 
            style={[
              styles.controlButton, 
              isAnalysisRunning ? styles.stopButton : styles.startButton,
              loading && styles.buttonDisabled
            ]} 
            onPress={isAnalysisRunning ? stopAnalysis : startAnalysis}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {isAnalysisRunning ? 'Stop Analysis' : 'Start Analysis'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.dataContainer}>
          {fftData ? (
            <View>
              <Text style={styles.sectionTitle}>Analysis Results</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Max Voltage:</Text>
                <Text style={styles.dataValue}>{fftData.max_voltage.toFixed(4)} V</Text>
              </View>
              
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Total Power:</Text>
                <Text style={styles.dataValue}>{fftData.total_power.toFixed(4)}</Text>
              </View>
              
              <Text style={styles.sectionTitle}>Peak Frequencies</Text>
              
              {fftData.peak_data && fftData.peak_data.length > 0 ? (
                fftData.peak_data.map((peak, index) => (
                  <View key={index} style={styles.peakContainer}>
                    <Text style={styles.peakTitle}>Peak {index + 1}</Text>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Frequency:</Text>
                      <Text style={styles.dataValue}>{peak.frequency.toFixed(2)} Hz</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Magnitude:</Text>
                      <Text style={styles.dataValue}>{peak.magnitude.toFixed(6)} V</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No peaks detected</Text>
              )}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {isAnalysisRunning ? 'Loading data...' : 'Start analysis to see data'}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
  
  // Connection screen (default)
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Connect to Server</Text>
        
        <Text style={styles.label}>IP Address</Text>
        <TextInput
          style={styles.input}
          value={ipAddress}
          onChangeText={setIpAddress}
          placeholder="e.g., 192.168.1.100"
        />
        
        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          placeholder="e.g., 5000"
          keyboardType="numeric"
        />
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={testConnection}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Connect</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  formContainer: {
    padding: 16,
    marginTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#bdbdbd',
  },
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContent: {
    alignItems: 'center',
    padding: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: 'white',
    marginBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  disconnectButton: {
    backgroundColor: '#f44336',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  buttonTextSmall: {
    color: '#fff',
    fontSize: 12,
  },
  controlPanel: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  controlButton: {
    padding: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#4caf50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  dataContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dataLabel: {
    fontWeight: 'bold',
  },
  dataValue: {
    fontFamily: 'monospace',
  },
  peakContainer: {
    marginVertical: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  peakTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2196F3',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: 24,
    color: '#757575',
  },
});