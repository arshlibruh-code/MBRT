#!/bin/bash

# Script to generate SSL certificates for current local IP address
# This is needed for HTTPS to work when sharing the app on local network

# Get local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ifconfig | grep -E "inet.*192\.168\.|inet.*10\.|inet.*172\.(1[6-9]|2[0-9]|3[0-1])" | grep -v "127.0.0.1" | head -1 | awk '{print $2}' | sed 's/addr://')

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not detect local IP address"
    echo "Please run: mkcert <your-ip-address> localhost 127.0.0.1"
    exit 1
fi

echo "📍 Detected local IP: $LOCAL_IP"
echo "🔐 Generating SSL certificates for: $LOCAL_IP, localhost, 127.0.0.1"

# Generate certificates using mkcert
mkcert "$LOCAL_IP" localhost 127.0.0.1

# Rename certificates to match IP
if [ -f "$LOCAL_IP.pem" ] && [ -f "$LOCAL_IP-key.pem" ]; then
    echo "✅ Certificates generated: $LOCAL_IP.pem and $LOCAL_IP-key.pem"
    echo ""
    echo "🚀 You can now run: npm run dev"
    echo "📱 Share this URL with colleagues: https://$LOCAL_IP:8000"
else
    echo "❌ Failed to generate certificates"
    exit 1
fi

