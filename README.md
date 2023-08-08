# code-challenge

A fullstack app code challenge before interview.

Also a good learning material to implement a fullstack app using standard aws resources with the latest versions of cli/sdk/cdk (2023-08)

Deployed version: https://main.d1xgvbtzwiqkcm.amplifyapp.com/

# How to play
- make sure you have `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` in your env
- add a github access token in aws secrets manager with name and field:
```
"github_access_token",
{
  jsonField: "code-chanllenge-1-amplify",
}
```
- fork and clone this repo
- install dependencies: `cd frontend` => `yarn`
- build frontend: `yarn build`
- install infra dependencies: `cd ../infra` => `npm install`
- cdk synth: `cdk synth`
- deploy: `cdk deploy`, record all the output details, you will need them later for local testing
- in `frontend/`, create a `.env` file, add the following env variables:
```
VITE_REGION=
VITE_USER_POOL_ID=
VITE_POOL_REGION=
VITE_POOL_CLIENT_ID=
VITE_IDENTITY_POOL_ID=
VITE_FILEBUCKET=
VITE_API_URL=
```
- run `yarn dev` to test the app locally (or directly use `AppUrl` to view the deployed version)
- `cdk destroy` to clean up the stack

# References used when working on this project

- setup local aws access if not done yet: https://docs.aws.amazon.com/sdkref/latest/guide/access-sso.html
- set up cdk: https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html
- refer to a simple template I created a few years ago: https://github.com/qiweiii/sample-react-cdk-app
- init cdk app: https://docs.aws.amazon.com/cdk/v2/guide/hello_world.html
- init a react 18 vite app: https://flaviocopes.com/vite-react-app/
- added resources based on official examples: https://github.com/aws-samples/aws-cdk-examples/tree/master/typescript
- refered to cdk doc: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html
- aws sdk v3: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
- create ssm document: https://docs.aws.amazon.com/systems-manager/latest/userguide/documents-creating-content.html
- connect amplify to existing resources: https://docs.amplify.aws/lib/auth/getting-started/q/platform/js/#install-amplify-libraries
- amplify vite toubleshoot: https://ui.docs.amplify.aws/react/getting-started/troubleshooting#uncaught-referenceerror-global-is-not-defined-1
- upload files: https://docs.amplify.aws/lib/storage/upload/q/platform/js/
- add s3 cdk cors: https://bobbyhadz.com/blog/add-cors-s3-bucket-aws-cdk
