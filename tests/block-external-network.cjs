const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

function allowedHost(value) {
  const host = String(value || '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();

  return [
    '127.0.0.1',
    'localhost',
    '::1'
  ].includes(host);
}

function hostFromArgs(args) {
  const a = args[0];

  if (typeof a === 'string') {
    try {
      return new URL(a).hostname;
    } catch {
      return a;
    }
  }

  if (a instanceof URL) {
    return a.hostname;
  }

  if (a && typeof a === 'object') {
    return a.hostname || a.host || '';
  }

  return '';
}

function guardRequest(original, name) {
  return function (...args) {
    const host = hostFromArgs(args);

    if (!allowedHost(host)) {
      throw new Error(
        `TEST NETWORK BLOCK: ${name} to ${host || 'unknown'}`
      );
    }

    return original.apply(this, args);
  };
}

http.request = guardRequest(http.request, 'HTTP');
http.get = guardRequest(http.get, 'HTTP');

https.request = guardRequest(https.request, 'HTTPS');
https.get = guardRequest(https.get, 'HTTPS');

const originalConnect = net.connect;

net.connect = guardRequest(originalConnect, 'TCP');
net.createConnection = guardRequest(
  net.createConnection,
  'TCP'
);

console.log('FaivoPay test network guard active');
