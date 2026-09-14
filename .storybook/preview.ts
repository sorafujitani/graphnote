/// <reference types="vite/client" />
import type { Preview } from "@storybook/react-vite";
import "../src/react-app/index.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
  tags: ["autodocs"],
};

export default preview;
