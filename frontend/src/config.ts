const config = {
  Auth: {
    region: import.meta.env.VITE_REGION,
    userPoolId: import.meta.env.VITE_USER_POOL_ID,
    userPoolWebClientId: import.meta.env.VITE_POOL_CLIENT_ID,
    identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID,
  },
  aws_cloud_logic_custom: [
    {
      name: "files-api",
      region: import.meta.env.VITE_REGION,
      endpoint: import.meta.env.VITE_API_URL,
    },
  ],
  Storage: {
    AWSS3: {
      bucket: import.meta.env.VITE_FILEBUCKET,
      region: import.meta.env.VITE_REGION,
    },
  },
};

export default config;
