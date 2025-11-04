import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  // SSL Certificate configuration (optional)
  // Set VITE_HTTPS_CERT and VITE_HTTPS_KEY environment variables if using HTTPS
  // Or auto-detect existing PEM files for the current network
  let certFile = process.env.VITE_HTTPS_CERT;
  let keyFile = process.env.VITE_HTTPS_KEY;
  
  if (!certFile || !keyFile) {
    // Try to find any PEM files matching common local IP patterns
    // This allows certificates to work on different networks (home, office, etc.)
    const pemFiles = fs.readdirSync('.').filter(file => 
      file.endsWith('.pem') && !file.includes('-key.pem')
    );
    
    // Look for certificates with IP addresses or localhost
    const certPattern = /^(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+\.\d+\+\d+|localhost)\.pem$/;
    const foundCert = pemFiles.find(file => certPattern.test(file));
    
    if (foundCert) {
      const baseName = foundCert.replace('.pem', '');
      const keyName = `${baseName}-key.pem`;
      
      if (fs.existsSync(keyName)) {
        certFile = `./${foundCert}`;
        keyFile = `./${keyName}`;
      }
    }
    
    // Fall back to localhost certificates if no IP-based certs found
    if (!certFile || !keyFile) {
      if (fs.existsSync('./localhost.pem') && fs.existsSync('./localhost-key.pem')) {
        certFile = './localhost.pem';
        keyFile = './localhost-key.pem';
      } else {
        // No certificates found - HTTPS will be disabled
        certFile = null;
        keyFile = null;
      }
    }
  }

  return {
    server: {
      host: true,
      port: 8000,
      // HTTPS is optional - only enable if certificates exist
      // For production, use a reverse proxy (nginx, etc.) instead of Vite's built-in HTTPS
      https: certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile) ? {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile)
      } : false
    },
    // Define environment variables to be available in client code
    // This allows using MAPBOX_ACCESS_TOKEN and PERPLEXITY_API_KEY without VITE_ prefix
    define: {
      'import.meta.env.MAPBOX_ACCESS_TOKEN': JSON.stringify(env.MAPBOX_ACCESS_TOKEN || ''),
      'import.meta.env.PERPLEXITY_API_KEY': JSON.stringify(env.PERPLEXITY_API_KEY || '')
    }
  };
});

