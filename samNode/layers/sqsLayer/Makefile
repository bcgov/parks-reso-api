build-SQSLayer:
					# copy dependency directory into artifacts directory
					cp -r * "$(ARTIFACTS_DIR)" 
					# remove makefile in artifacts directory
					rm "$(ARTIFACTS_DIR)/Makefile"
					# remove package.json to avoid rebuilding when changes don't relate to dependencies
					rm "$(ARTIFACTS_DIR)/nodejs/package.json"
