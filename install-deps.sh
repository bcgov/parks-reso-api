#!/usr/bin/env bash

echo "Installing Lambda js dependencies"

cd deletePass && npm ci
cd ../readConfig && npm ci
cd ../readFacility && npm ci
cd ../readPark && npm ci
cd ../readPass && npm ci
cd ../writeConfig && npm ci
cd ../writeFacility && npm ci
cd ../writePark && npm ci
cd ../writePass && npm ci

echo "Dependency installation complete"