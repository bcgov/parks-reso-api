# Use the official AWS Lambda Node.js 18 image as the base image
FROM public.ecr.aws/lambda/nodejs:18

# Copy the contents of your SAM app directory into the container
COPY . ./

# Install dependencies using npm (assuming you have a package.json file)
RUN npm install
