#!/usr/bin/env node
/**
 * stdio-to-TCP Bridge for Docker MCP Gateway
 * 
 * This script runs on the HOST machine and bridges stdio communication
 * from the Docker MCP Gateway to a TCP socket that containers can connect to.
 * 
 * Usage: node stdio-tcp-bridge.js [port]
 */

const net = require('net');
const { spawn } = require('child_process');

const PORT = process.argv[2] || 3100;
const HOST = '0.0.0.0';

console.log(`[MCP Bridge] Starting stdio-to-TCP bridge on ${HOST}:${PORT}`);

const server = net.createServer((socket) => {
  console.log(`[MCP Bridge] Client connected from ${socket.remoteAddress}:${socket.remotePort}`);

  // Spawn the docker mcp gateway process
  const gateway = spawn('docker', ['mcp', 'gateway', 'run', '--enable-all-servers'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Forward data from socket to gateway stdin
  socket.on('data', (data) => {
    gateway.stdin.write(data);
  });

  // Forward data from gateway stdout to socket
  gateway.stdout.on('data', (data) => {
    socket.write(data);
  });

  // Log stderr for debugging
  gateway.stderr.on('data', (data) => {
    console.error(`[MCP Gateway stderr]: ${data.toString()}`);
  });

  // Handle disconnections
  socket.on('end', () => {
    console.log(`[MCP Bridge] Client disconnected`);
    gateway.kill();
  });

  socket.on('error', (err) => {
    console.error(`[MCP Bridge] Socket error:`, err.message);
    gateway.kill();
  });

  gateway.on('exit', (code) => {
    console.log(`[MCP Bridge] Gateway process exited with code ${code}`);
    socket.end();
  });

  gateway.on('error', (err) => {
    console.error(`[MCP Bridge] Gateway spawn error:`, err.message);
    socket.end();
  });
});

server.on('error', (err) => {
  console.error(`[MCP Bridge] Server error:`, err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[MCP Bridge] Server listening on ${HOST}:${PORT}`);
  console.log(`[MCP Bridge] Ready to bridge Docker MCP Gateway connections`);
});

process.on('SIGINT', () => {
  console.log('\n[MCP Bridge] Shutting down...');
  server.close(() => {
    console.log('[MCP Bridge] Server closed');
    process.exit(0);
  });
});
