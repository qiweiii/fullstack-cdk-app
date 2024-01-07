# `fullstack-cdk-app` template

A fullstack app *template*:

- Frontend:
  - React
  - TypeScript
  - Vite
  - AWS Amplify (for auth, api access, and continuous deployment)

- Backend & infra:
  - TypeScript
  - Lambda for backend logics
  - AWS CDK (Amazon Cognito, S3, SSM, VPC, DDB, API Gateway, Amplify)


## Install

```sh
npx degit qiweiii/fullstack-cdk-app my-app
```

## Running locally
1. make sure you have `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` in your env
2. add a github access token in aws secrets manager with name and field:
    ```
    "github_access_token",
    {
      jsonField: "code-chanllenge-1-amplify",
    }
    ```
3. install frontend dependencies: `cd frontend` => `yarn`
4. build frontend: `yarn build`
5. install infra dependencies: `cd ../infra` => `npm install`
6. view infra stack: `cdk synth`
7. deploy: `cdk deploy` (**IMPT**: record all the output info, you will need them later for local testing)
8. in `frontend/`, create a `.env` file, add the following env variables based on the output from the previous step
    ```
    VITE_REGION=
    VITE_USER_POOL_ID=
    VITE_POOL_REGION=
    VITE_POOL_CLIENT_ID=
    VITE_IDENTITY_POOL_ID=
    VITE_FILEBUCKET=
    VITE_API_URL=
    ```
9. run `yarn dev` to test the app locally (or directly use `AppUrl` from step 7 to view the deployed version)
10. `cdk destroy` to clean up the stack

## Todo

- [ ] aws-sdk migrate to v3, so NodejsFunction can use node v18
- [ ] frontend migrate to amplify v6

## References & links

- setup local aws access: https://docs.aws.amazon.com/sdkref/latest/guide/access-sso.html
- set up cdk: https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html
- init cdk app: https://docs.aws.amazon.com/cdk/v2/guide/hello_world.html
- init a react 18 vite app: https://flaviocopes.com/vite-react-app/
- aws cdk official examples: https://github.com/aws-samples/aws-cdk-examples/tree/master/typescript
- cdk doc: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html
- aws sdk v3: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
- how to create ssm document: https://docs.aws.amazon.com/systems-manager/latest/userguide/documents-creating-content.html
- amplify(v5) connect to existing resources: https://docs.amplify.aws/lib/auth/getting-started/q/platform/js/#install-amplify-libraries
- amplify(v5) vite troubleshoot: https://ui.docs.amplify.aws/react/getting-started/troubleshooting#uncaught-referenceerror-global-is-not-defined-1
- amplify(v5) upload files: https://docs.amplify.aws/lib/storage/upload/q/platform/js/
- amplify(v5) api configuration troubleshoot: https://docs.amplify.aws/lib/restapi/authz/q/platform/js/
- super good cdk blogs: https://bobbyhadz.com/
- add s3 cdk cors: https://bobbyhadz.com/blog/add-cors-s3-bucket-aws-cdk
- useful gist with list of aws managed policies:
  - https://gist.github.com/bernadinm/6f68bfdd015b3f3e0a17b2f00c9ea3f8
  - https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html
- ddb event source filters:
  - https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.Lambda.Tutorial2.html
  - https://stackoverflow.com/questions/70363945/filter-criteria-in-lambda-function
- for lambda created ec2 instances, need iam:PassRole for both lambda role and instance profile role
  - https://stackoverflow.com/questions/54788320/access-issue-with-lambda-trying-to-launch-ec2-instance
- print encoded authorization error message:
  - https://stackoverflow.com/questions/66110275/aws-ec2-you-are-not-authorized-to-perform-this-operation-encoded-authorization
  - `aws sts decode-authorization-message --encoded-message`
- fix confusing ssm error: `Instances [[]] not in a valid state for account`
  - https://medium.com/@the.nick.miller/use-python-lambdas-to-remotely-run-shell-commands-on-ec2-instances-57a92a2f5943
