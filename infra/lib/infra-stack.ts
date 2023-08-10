import { Construct } from "constructs";
import { join } from "node:path";
import * as amplify from "@aws-cdk/aws-amplify-alpha";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  CfnOutput,
  Duration,
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
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
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
    // create Security Group for debugging inside Instance
    const cc1SG = new ec2.SecurityGroup(this, "cc1-sg", {
      vpc,
      allowAllOutbound: true,
    });
    cc1SG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "allow SSH access from anywhere"
    );
    cc1SG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "allow HTTP traffic from anywhere"
    );
    cc1SG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "allow HTTPS traffic from anywhere"
    );
    // choose latest Amazon Linux 2 image to use instance connect and ssm
    const ami = ec2.MachineImage.latestAmazonLinux2({
      cachedInContext: false,
    });
    const cfnKeyPair = new ec2.CfnKeyPair(this, "code-challenge-1-CfnKeyPair", {
      keyName: "CC1-key-name",
    });
    const passRolePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ["iam:PassRole"],
          resources: ["*"],
        }),
      ],
    });
    // Instance role for trigger ec2
    const instanceRole = new iam.Role(this, "CC1-InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      inlinePolicies: {
        passRolePolicy,
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
      ],
    });
    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "CC1-MyCfnInstanceProfile",
      {
        roles: [instanceRole.roleName],
      }
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
    // common lambda props
    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          "@aws-sdk/*", // Use the 'aws-sdk' available in the Lambda runtime
          "aws-lambda",
        ],
      },
      environment: {
        TABLE_NAME: dynamoTable.tableName,
      },
      runtime: lambda.Runtime.NODEJS_18_X,
    };
    // lambda's role for trigger vm
    const lambdaTriggerVmRole = new iam.Role(
      this,
      "code-challenge-1-LambdaExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        inlinePolicies: {
          passRolePolicy,
          ssmAccess: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ["ssm:SendCommand", "ssm:DescribeInstanceInformation"],
                resources: ["*"],
              }),
            ],
          }),
        },
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
        ],
      }
    );
    // lambda for creating vm and run script
    const triggerVmFunction = new NodejsFunction(this, "triggerVmFunction", {
      ...nodeJsFunctionProps,
      role: lambdaTriggerVmRole,
      entry: join(__dirname, "lambdas", "trigger-vm.ts"),
      timeout: Duration.minutes(15),
      environment: {
        ...nodeJsFunctionProps.environment,
        SUBNET_ID: vpc.publicSubnets[0].subnetId,
        AMI_ID: ami.getImage(this).imageId,
        KEY_NAME: cfnKeyPair.keyName,
        FILE_BUCKET: fileBucket.bucketName,
        SSM_DOCUMENT_NAME: cfnDocument.name || "",
        INSTANCE_PROFILE_ARN: instanceProfile.attrArn,
        SG_ID: cc1SG.securityGroupId,
      },
    });
    // Add DynamoDB event source to Lambda function
    triggerVmFunction.addEventSource(
      new DynamoEventSource(dynamoTable, {
        batchSize: 1,
        startingPosition: lambda.StartingPosition.LATEST,
        retryAttempts: 0, // must specify a number or it call infinitely
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("INSERT"),
          }),
        ],
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
    // create authorizer
    const authorizer = new apigateway.CfnAuthorizer(this, "cfnAuth", {
      restApiId: api.restApiId,
      name: "CC1APIAuthorizer",
      type: "COGNITO_USER_POOLS",
      identitySource: "method.request.header.Authorization",
      providerArns: [userPool.userPoolArn],
    });
    // add method with authorizer
    const files = api.root.addResource("files");
    files.addMethod("POST", createOneIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: authorizer.ref,
      },
    });
    files.addCorsPreflight({
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
    });

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
    new CfnOutput(this, "ApiName", {
      value: api.restApiName,
    });
    new CfnOutput(this, "AppUrl", {
      value: amplifyApp.defaultDomain,
    });
  }
}
