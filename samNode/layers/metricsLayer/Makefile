build-MetricsLayer:
					# copy dependency directory into artifacts directory
					cp -r * "$(ARTIFACTS_DIR)" 
					# remove makefile in artifacts directory
					rm "$(ARTIFACTS_DIR)/Makefile"
					# install dependencies in artifacts directory
					cd nodejs && npm install --prefix "$(ARTIFACTS_DIR)"/nodejs
					# symlink to node_modules folder for testing purposes
					cd "$(ARTIFACTS_DIR)" && ln -s "$(ARTIFACTS_DIR)"/nodejs/node_modules node_modules
					# remove package.json to avoid rebuilding when changes don't relate to dependencies
					rm "$(ARTIFACTS_DIR)/nodejs/package.json"
