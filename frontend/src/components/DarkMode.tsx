import * as React from "react";
import {
  Card,
  ColorMode,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  defaultDarkModeOverride,
} from "@aws-amplify/ui-react";

export const DefaultDarkMode = ({
  children,
}: {
  children: React.ReactElement;
}) => {
  const [colorMode, setColorMode] = React.useState<ColorMode>("system");
  const theme = {
    name: "my-theme",
    overrides: [defaultDarkModeOverride],
  };

  return (
    <ThemeProvider theme={theme} colorMode={colorMode}>
      <Card borderRadius="0">
        <ToggleButtonGroup
          value={colorMode}
          isExclusive
          onChange={(value: unknown) => setColorMode(value as ColorMode)}
        >
          <ToggleButton value="light">Light</ToggleButton>
          <ToggleButton value="dark">Dark</ToggleButton>
          <ToggleButton value="system">System</ToggleButton>
        </ToggleButtonGroup>
      </Card>
      {children}
    </ThemeProvider>
  );
};
