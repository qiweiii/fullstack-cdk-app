#!/bin/bash

# Function to retrieve inputs from DynamoDB
retrieve_inputs_from_dynamodb() {
  id=$1
  region=$2

  input_text=$(aws dynamodb get-item --table-name file-items --key "{\"id\": {\"S\": \"$id\"}}" --region $region --query 'Item.input_text.S' --output text)

  if [[ -z $input_text ]]; then
    echo "Input not found for id: $id"
    exit 1
  fi

  echo $input_text
}

# Function to retrieve input_file_path from DynamoDB
retrieve_input_file_path_from_dynamodb() {
  id=$1
  region=$2

  input_file_path=$(aws dynamodb get-item --table-name file-items --key "{\"id\": {\"S\": \"$id\"}}" --region $region --query 'Item.input_file_path.S' --output text)

  if [[ -z $input_file_path ]]; then
    echo "Input file path not found for id: $id"
    exit 1
  fi

  echo $input_file_path
}

# Function to download input file from S3
download_input_file_from_s3() {
  input_file=$1
  region=$2

  aws s3 cp s3://$input_file input.txt --region $region
}

# Function to append input to output file
append_input_to_output_file() {
  input=$1
  input_file=$2
  output_file=$3

  output_text="$(cat $input_file) : $input"

  echo $output_text >> $output_file
}

# Function to upload output file to S3
upload_output_file_to_s3() {
  bucket_name=$1
  output_file=$2
  region=$3

  aws s3 cp $output_file s3://$bucket_name/$output_file --region $region
}

# Function to save outputs to DynamoDB
save_outputs_to_dynamodb() {
  id=$1
  output_file=$2
  region=$3

  aws dynamodb update-item --table-name file-items --key "{\"id\": {\"S\": \"$id\"}}" --update-expression "SET output_file_path = :outputFile" --expression-attribute-values "{\":outputFile\": {\"S\": \"$output_file\"}}" --region $region
}

# Main function
main() {
  id=$1
  bucket_name=$2
  region=$3

  if [[ -z $id || -z $bucket_name || -z $region ]]; then
    echo "Please provide the id, bucketName, and region as command-line arguments"
    exit 1
  fi

  output_file="${id}_output.txt"

  input_text=$(retrieve_inputs_from_dynamodb $id $region)
  input_file_path=$(retrieve_input_file_path_from_dynamodb $id $region)
  download_input_file_from_s3 $input_file_path $region
  append_input_to_output_file "$input_text" "input.txt" $output_file
  upload_output_file_to_s3 $bucket_name $output_file $region
  # save_outputs_to_dynamodb $id "$bucket_name/$output_file" $region

  echo "Task completed successfully!"
}

main $@