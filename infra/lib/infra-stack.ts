import { Construct } from "constructs";
import { join } from "node:path";
import * as amplify from "@aws-cdk/aws-amplify-alpha";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  CfnOutput,
  aws_apigateway as apigateway,
  aws_cognito as cognito,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_ssm as ssm,
  aws_iam as iam,
} from "aws-cdk-lib";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { RemovalPolicy, SecretValue, Stack, StackProps } from "aws-cdk-lib";

export class InfraStackCC1 extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ========================================================================
    // Resource: Amazon Cognito User Pool
    // ========================================================================
    // high level construct
    const userPool: cognito.UserPool = new cognito.UserPool(
      this,
      "code-challenge-1-UserPool-" + id,
      {
        selfSignUpEnabled: true, // Allow users to sign up
        autoVerify: { email: true }, // Verify email addresses by sending a verification code
        signInAliases: { email: true }, // Set email as an alias
      }
    );
    // any properties that are not part of the high level construct can be added using this method
    const userPoolCfn = userPool.node.defaultChild as cognito.CfnUserPool;
    userPoolCfn.userPoolAddOns = { advancedSecurityMode: "ENFORCED" };
    userPoolCfn.schema = [
      {
        name: "CC1UserPool",
        attributeDataType: "String",
        mutable: true,
        required: false,
        stringAttributeConstraints: {
          maxLength: "2000",
        },
      },
    ];
    // create two user groups, one for admins one for users
    // these groups can be used without configuring a 3rd party IdP
    new cognito.CfnUserPoolGroup(this, "code-challenge-1-AdminsGroup", {
      groupName: "admin",
      userPoolId: userPool.userPoolId,
    });

    new cognito.CfnUserPoolGroup(this, "code-challenge-1-UsersGroup", {
      groupName: "users",
      userPoolId: userPool.userPoolId,
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "code-challenge-1-UserPoolClient",
      {
        userPool,
        generateSecret: false, // Don't need to generate secret for web app running on browsers
      }
    );

    // ========================================================================
    // Resource: Amazon Cognito Identity Pool
    // ========================================================================
    // Purpose: provide temporary AWS credentials for users who are guests (unauthenticated)
    // and for users who have been authenticated and received a token.
    const identityPool = new cognito.CfnIdentityPool(
      this,
      "code-challenge-1-IdentityPool-" + id,
      {
        allowUnauthenticatedIdentities: false,
        cognitoIdentityProviders: [
          {
            clientId: userPoolClient.userPoolClientId,
            providerName: userPool.userPoolProviderName,
          },
        ],
      }
    );
    const isUserCognitoGroupRole = new iam.Role(
      this,
      "code-challenge-1-users-group-role",
      {
        description: "Default role for authenticated users",
        assumedBy: new iam.FederatedPrincipal(
          "cognito-identity.amazonaws.com",
          {
            StringEquals: {
              "cognito-identity.amazonaws.com:aud": identityPool.ref,
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "authenticated",
            },
          },
          "sts:AssumeRoleWithWebIdentity"
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );
    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "cc1-identity-pool-role-attachment",
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: isUserCognitoGroupRole.roleArn,
        },
        roleMappings: {
          mapping: {
            type: "Token",
            ambiguousRoleResolution: "AuthenticatedRole",
            identityProvider: `cognito-idp.${
              Stack.of(this).region
            }.amazonaws.com/${userPool.userPoolId}:${
              userPoolClient.userPoolClientId
            }`,
          },
        },
      }
    );

    // ========================================================================
    // Resource: Amazon S3 Bucket
    // ========================================================================
    // Purpose: file storage
    const fileBucket = new s3.Bucket(this, "code-challenge-1-FileBucket", {
      bucketName: "code-challenge-1-file-bucket",
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          // TODO: should restrict to only the frontend domain, but results in circular dependency
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });
    // add a script for vm execution later
    const scriptBucket = new s3.Bucket(this, "code-challenge-1-ScriptBucket", {
      bucketName: "code-challenge-1-script-bucket",
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
    });

    // ========================================================================
    // Resource: SSM
    // ========================================================================
    // add SSM Document (script for running in ec2 vm)
    const cfnDocument = new ssm.CfnDocument(
      this,
      "code-challenge-1-SsmDocument",
      {
        content: {
          schemaVersion: "2.2",
          description: "Run a script",
          parameters: {
            id: {
              type: "String",
            },
            region: {
              type: "String",
              default: process.env.CDK_DEFAULT_REGION,
            },
            bucketName: {
              type: "String",
              default: fileBucket.bucketName,
            },
          },
          mainSteps: [
            {
              action: "aws:downloadContent",
              name: "downloadScript",
              inputs: {
                sourceType: "S3",
                sourceInfo: {
                  path: scriptBucket.urlForObject("vm-script.sh"),
                },
              },
            },
            {
              action: "aws:runShellScript",
              name: "runScript",
              inputs: {
                timeoutSeconds: "300",
                runCommand: [
                  "./vm-script.sh {{id}} {{bucketName}} {{region}} ",
                ],
              },
            },
          ],
        },
        documentType: "Command",
        name: "code-challenge-1-vm-script-document",
      }
    );

    // ========================================================================
    // Resource: VPC
    // ========================================================================
    // Purpose: for creating an EC2 instance
    const vpc = new ec2.Vpc(this, "code-challenge-1-VPC", {
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "CC1-vpc-subnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });
    const ami = ec2.MachineImage.latestAmazonLinux2023({
      cachedInContext: false,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });
    const cfnKeyPair = new ec2.CfnKeyPair(this, "code-challenge-1-CfnKeyPair", {
      keyName: "CC1-key-name",
    });
    // Instance role that allows SSM to connect
    const role = new iam.Role(this, "InstanceRoleWithSsmPolicy", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    // ========================================================================
    // Resource: Amazon DynamoDB Table
    // ========================================================================
    // Purpose: data storage
    const dynamoTable = new dynamodb.Table(this, "code-challenge-1-FileTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      tableName: "file-items",
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // ========================================================================
    // Resource: Lambda
    // ========================================================================
    // lambda for creating vm and run script
    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          "@aws-sdk/*", // Use the 'aws-sdk' available in the Lambda runtime
          "aws-lambda",
          "nanoid",
        ],
      },
      environment: {
        TABLE_NAME: dynamoTable.tableName,
      },
      runtime: lambda.Runtime.NODEJS_18_X,
    };
    const triggerVmFunction = new NodejsFunction(this, "triggerVmFunction", {
      ...nodeJsFunctionProps,
      entry: join(__dirname, "lambdas", "trigger-vm.ts"),
      environment: {
        ...nodeJsFunctionProps.environment,
        SUBNET_ID: vpc.publicSubnets[0].subnetId,
        AMI_ID: ami.getImage(this).imageId,
        KEY_NAME: cfnKeyPair.keyName,
        FILE_BUCKET: fileBucket.bucketName,
        SSM_DOCUMENT_NAME: cfnDocument.name || "",
        ROLE_ARN: role.roleArn,
      },
    });
    // Add DynamoDB event source to Lambda function
    triggerVmFunction.addEventSource(
      new DynamoEventSource(dynamoTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 1,
      })
    );

    // lambda for file creation
    const createOneLambda = new NodejsFunction(this, "createItemFunction", {
      entry: join(__dirname, "lambdas", "create.ts"),
      ...nodeJsFunctionProps,
    });
    // db access
    dynamoTable.grantReadWriteData(createOneLambda);
    // integrate with api gateway
    const createOneIntegration = new apigateway.LambdaIntegration(
      createOneLambda
    );

    // ========================================================================
    // API Gateway
    // ========================================================================
    // Purpose: create a REST API
    const api = new apigateway.RestApi(this, "code-challenge-1-Api", {
      restApiName: "CC1-Api",
      description: "This service serves code-challenge-1",
      deployOptions: {
        stageName: "dev",
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });
    const files = api.root.addResource("files");
    // create authorizer
    const authorizer = new apigateway.CfnAuthorizer(this, "cfnAuth", {
      restApiId: api.restApiId,
      name: "CC1APIAuthorizer",
      type: "COGNITO_USER_POOLS",
      identitySource: "method.request.header.Authorization",
      providerArns: [userPool.userPoolArn],
    });
    // add method with authorizer
    files.addMethod("POST", createOneIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: authorizer.ref,
      },
    });
    addCorsOptions(files);

    // ========================================================================
    // Resource: Amplify App
    // ========================================================================
    // Purpose: creates an amplify frontend app
    const amplifyApp = new amplify.App(this, "code-challenge-1-AmplifyApp", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        repository: "code-challenge-1",
        owner: "qiweiii",
        oauthToken: SecretValue.secretsManager(
          "github_access_token",
          {
            jsonField: "code-chanllenge-1-amplify",
          }
          // note: i set github_access_token on github to expire in 90 days,
          // so rmb to re-create it and add to aws secretsManager again later on
        ),
      }),
      environmentVariables: {
        VITE_REGION: process.env.CDK_DEFAULT_REGION || "ap-southeast-1",
        VITE_USER_POOL_ID: userPool.userPoolId,
        VITE_POOL_REGION: process.env.CDK_DEFAULT_REGION || "ap-southeast-1",
        VITE_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        VITE_IDENTITY_POOL_ID: identityPool.ref,
        VITE_FILEBUCKET: fileBucket.bucketName,
        VITE_API_URL: api.url,
      },
    });
    const main = amplifyApp.addBranch("main");
    amplifyApp.addCustomRule(
      amplify.CustomRule.SINGLE_PAGE_APPLICATION_REDIRECT
    );

    // ========================================================================
    // Resource: Final Setups
    // ========================================================================
    // at last, add a bucket deployment
    new BucketDeployment(this, "code-challenge-1-vm-script", {
      sources: [Source.asset("./lib/vm-files")],
      destinationBucket: scriptBucket,
      retainOnDelete: false,
    });

    // ========================================================================
    // Resource: Export values
    // ========================================================================
    new CfnOutput(this, "amplify", {
      value: amplifyApp.appId,
    });
    new CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "IdentityPoolId", {
      value: identityPool.ref,
    });
    new CfnOutput(this, "FileBucket", {
      value: fileBucket.bucketName,
    });
    new CfnOutput(this, "ApiUrl", {
      value: api.url,
    });
    new CfnOutput(this, "AppUrl", {
      value: amplifyApp.defaultDomain,
    });
  }
}

export function addCorsOptions(apiResource: apigateway.IResource) {
  apiResource.addMethod(
    "OPTIONS",
    new apigateway.MockIntegration({
      // In case you want to use binary media types, uncomment the following line
      // contentHandling: ContentHandling.CONVERT_TO_TEXT,
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers":
              "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Credentials":
              "'false'",
            "method.response.header.Access-Control-Allow-Methods":
              "'OPTIONS,GET,PUT,POST,DELETE'",
          },
        },
      ],
      // In case you want to use binary media types, comment out the following line
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }),
    {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
            "method.response.header.Access-Control-Allow-Credentials": true,
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
      ],
    }
  );
}
