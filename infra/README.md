## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Notes

This backend contains an example app with the following logic
- user upload a file
- save to s3
- trigger lambda
- lambda creates an ec2 instance
- ec2 instance run a script

Main files
- `lib/infra-stack` contains the CDK code for the infrastructure
- `lib/lambdas` contains the lambda functions
- `lib/vm-files` contains the files that will be download in ec2
