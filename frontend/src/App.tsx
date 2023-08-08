import "./App.css";
import "@aws-amplify/ui-react/styles.css";
import { API, Amplify, Storage } from "aws-amplify";
import {
  Authenticator,
  Button,
  Divider,
  Flex,
  Text,
  TextField,
  View,
  useTheme,
} from "@aws-amplify/ui-react";

import { DefaultDarkMode } from "./components/DarkMode";
import { useState } from "react";
import config from "./config";

const aConfig = Amplify.configure(config);
console.log("Amplify config ", aConfig);

async function apiPostData(input_text: string, input_file_path: string) {
  const apiName = "files-api";
  const path = "/files";
  const myInit = {
    body: {
      input_text: input_text,
      input_file_path: input_file_path,
    },
  };

  return await API.post(apiName, path, myInit);
}

export default function App() {
  const { tokens } = useTheme();
  const [text, setText] = useState<string>("");
  const [file, setFile] = useState<File | null>();
  const [loading, setLoading] = useState<boolean>(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (!file) {
        throw new Error("No file to upload!");
      }
      const uploadRes = await Storage.put(file?.name, file, {});
      console.log("File Uploaded ", uploadRes);
      const filePath = uploadRes?.key;
      if (filePath) {
        await apiPostData(text, filePath);
        setText("");
      } else {
        throw new Error("No uploaded file path!");
      }
    } catch (error) {
      console.log("Submit Error: ", error);
      setLoading(false);
    }
    setLoading(false);
  };

  return (
    <DefaultDarkMode>
      <View
        as="main"
        minHeight={"calc(100vh - 74px)"}
        backgroundColor={tokens.colors.background.primary}
      >
        <Flex justifyContent={"center"} alignItems={"center"}>
          <Authenticator initialState="signUp">
            {({ signOut, user }) => (
              <Flex direction={"column"} minWidth={"60vw"}>
                <Text>Hello {user?.attributes?.email}!</Text>
                <Button onClick={signOut} width={100}>
                  Sign out
                </Button>

                <Divider marginTop={20} marginBottom={20} />

                {/* Input text */}
                <TextField
                  placeholder="Text Input"
                  label="Text Input"
                  maxLength={100}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />

                {/* File upload feature */}
                <input
                  type="file"
                  name="file"
                  accept=".txt"
                  onChange={(e) => setFile(e.target.files?.[0])}
                />
                <Button
                  width={100}
                  disabled={!text || !file || loading}
                  onClick={submit}
                >
                  Submit
                </Button>
              </Flex>
            )}
          </Authenticator>
        </Flex>
      </View>
    </DefaultDarkMode>
  );
}
