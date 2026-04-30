# Use the official AWS Lambda Node.js 22 image as the base image
FROM public.ecr.aws/lambda/nodejs:22

# Copy the contents of your SAM app directory into the container
COPY . ./

# Install dependencies using npm (assuming you have a package.json file)
RUN npm install
