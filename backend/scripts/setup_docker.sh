#!/bin/bash

# EduZyniq Coding Mentor - Docker Sandbox Setup
# This script pulls all necessary images for the multi-language sandbox.

echo "🚀 Setting up EduZyniq Coding Mentor Sandbox..."

IMAGES=(
    "python:3.11-slim"
    "node:20-slim"
    "eclipse-temurin:17-jdk"
    "gcc:latest"
    "golang:1.21-alpine"
    "rust:1.72-slim"
    "php:8.2-cli-alpine"
    "ruby:3.2-alpine"
)

for img in "${IMAGES[@]}"; do
    echo "📥 Pulling $img..."
    docker pull $img
done

echo "✅ All sandbox images are ready!"
