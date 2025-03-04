import { Html, Head, Main, NextScript } from "next/document";
import clsx from "clsx";

import { fontMono, fontOutfit, fontSans } from "@/config/fonts";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body
        className={clsx(
          "min-h-screen bg-background font-outfit antialiased",
          fontMono.variable,
        )}
      >
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
