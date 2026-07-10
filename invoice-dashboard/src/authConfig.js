import { LogLevel } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: "9504d785-f30f-4504-8951-0eab566ffc50",
    authority: "https://login.microsoftonline.com/7c51239d-08e0-4f24-92b0-68ca7dccba54",
    redirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii || level > LogLevel.Warning) return;
        console.warn("[MSAL]", message);
      },
    },
  },
};

export const GRAPH_SCOPES = ["Files.Read.All", "Sites.Read.All"];

export const SHAREPOINT_SHARE_URL =
  "https://gobalharts.sharepoint.com/:x:/s/HARTSFellowship-2025/IQA8Y23YWKyZTbJYZ6R-JO-ZAZv2o_Y9XXmNnyZSdmxu3xE?e=Bk8gMm";
