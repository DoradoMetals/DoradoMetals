import {colors, heroui} from "@heroui/theme"

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layouts/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#ffb400",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      "themes": {
        "dorado-light": {
          "colors": {
            "default": {
              "50": "#fafafa",
              "100": "#f2f2f3",
              "200": "#ebebec",
              "300": "#e3e3e6",
              "400": "#dcdcdf",
              "500": "#d4d4d8",
              "600": "#afafb2",
              "700": "#8a8a8c",
              "800": "#656567",
              "900": "#404041",
              "foreground": "#000",
              "DEFAULT": "#d4d4d8"
            },
            "primary": {
              "50": "#fff6df",
              "100": "#ffe9b3",
              "200": "#ffdb86",
              "300": "#ffce59",
              "400": "#ffc12d",
              "500": "#ffb400",
              "600": "#d29500",
              "700": "#a67500",
              "800": "#795600",
              "900": "#4d3600",
              "foreground": "#000",
              "DEFAULT": "#ffb400"
            },
            "secondary": {
              "50": "#e3e4e7",
              "100": "#bcbfc4",
              "200": "#9499a2",
              "300": "#6d7480",
              "400": "#454e5d",
              "500": "#1e293b",
              "600": "#192231",
              "700": "#141b26",
              "800": "#0e131c",
              "900": "#090c12",
              "foreground": "#fff",
              "DEFAULT": "#1e293b"
            },
            "success": {
              "50": "#e7fbe7",
              "100": "#c5f6c5",
              "200": "#a4f1a4",
              "300": "#82ec82",
              "400": "#61e661",
              "500": "#3fe13f",
              "600": "#34ba34",
              "700": "#299229",
              "800": "#1e6b1e",
              "900": "#134413",
              "foreground": "#000",
              "DEFAULT": "#3fe13f"
            },
            "warning": {
              "50": "#fff0df",
              "100": "#ffdbb3",
              "200": "#ffc686",
              "300": "#ffb259",
              "400": "#ff9d2d",
              "500": "#ff8800",
              "600": "#d27000",
              "700": "#a65800",
              "800": "#794100",
              "900": "#4d2900",
              "foreground": "#000",
              "DEFAULT": "#ff8800"
            },
            "danger": {
              "50": "#fae9e9",
              "100": "#f3caca",
              "200": "#ecabab",
              "300": "#e58d8d",
              "400": "#de6e6e",
              "500": "#d74f4f",
              "600": "#b14141",
              "700": "#8c3333",
              "800": "#662626",
              "900": "#411818",
              "foreground": "#000",
              "DEFAULT": "#d74f4f"
            },
            "background": "#F5F5F5",
            "foreground": {
              "50": "#e1e1e1",
              "100": "#b8b8b8",
              "200": "#8e8e8e",
              "300": "#656565",
              "400": "#3b3b3b",
              "500": "#121212",
              "600": "#0f0f0f",
              "700": "#0c0c0c",
              "800": "#090909",
              "900": "#050505",
              "foreground": "#fff",
              "DEFAULT": "#121212"
            },
            "content1": {
              "DEFAULT": "#ffffff",
              "foreground": "#000"
            },
            "content2": {
              "DEFAULT": "#f4f4f5",
              "foreground": "#000"
            },
            "content3": {
              "DEFAULT": "#e4e4e7",
              "foreground": "#000"
            },
            "content4": {
              "DEFAULT": "#d4d4d8",
              "foreground": "#000"
            },
            "focus": "#006FEE",
            "overlay": "#000000",
            "divider": "#111111"
          }
        },
        "dorado-dark": {
          "colors": {
            "default": {
              "50": "#131315",
              "100": "#1e1e21",
              "200": "#29292e",
              "300": "#34343a",
              "400": "#3f3f46",
              "500": "#616166",
              "600": "#828287",
              "700": "#a4a4a7",
              "800": "#c5c5c8",
              "900": "#e7e7e8",
              "foreground": "#fff",
              "DEFAULT": "#3f3f46"
            },
            "primary": {
              "50": "#4d3600",
              "100": "#795600",
              "200": "#a67500",
              "300": "#d29500",
              "400": "#ffb400",
              "500": "#ffc12d",
              "600": "#ffce59",
              "700": "#ffdb86",
              "800": "#ffe9b3",
              "900": "#fff6df",
              "foreground": "#000",
              "DEFAULT": "#ffb400"
            },
            "secondary": {
              "50": "#323336",
              "100": "#4e5056",
              "200": "#6b6e75",
              "300": "#888b95",
              "400": "#a5a9b4",
              "500": "#b5b8c1",
              "600": "#c5c7ce",
              "700": "#d4d6db",
              "800": "#e4e5e9",
              "900": "#f4f4f6",
              "foreground": "#000",
              "DEFAULT": "#a5a9b4"
            },
            "success": {
              "50": "#134413",
              "100": "#1e6b1e",
              "200": "#299229",
              "300": "#34ba34",
              "400": "#3fe13f",
              "500": "#61e661",
              "600": "#82ec82",
              "700": "#a4f1a4",
              "800": "#c5f6c5",
              "900": "#e7fbe7",
              "foreground": "#000",
              "DEFAULT": "#3fe13f"
            },
            "warning": {
              "50": "#4d2900",
              "100": "#794100",
              "200": "#a65800",
              "300": "#d27000",
              "400": "#ff8800",
              "500": "#ff9d2d",
              "600": "#ffb259",
              "700": "#ffc686",
              "800": "#ffdbb3",
              "900": "#fff0df",
              "foreground": "#000",
              "DEFAULT": "#ff8800"
            },
            "danger": {
              "50": "#4d1717",
              "100": "#792525",
              "200": "#a63232",
              "300": "#d24040",
              "400": "#ff4d4d",
              "500": "#ff6c6c",
              "600": "#ff8b8b",
              "700": "#ffaaaa",
              "800": "#ffcaca",
              "900": "#ffe9e9",
              "foreground": "#000",
              "DEFAULT": "#ff4d4d"
            },
            "background": "#18181b",
            "foreground": {
              "50": "#4d4d4d",
              "100": "#797979",
              "200": "#a6a6a6",
              "300": "#d2d2d2",
              "400": "#ffffff",
              "500": "#ffffff",
              "600": "#ffffff",
              "700": "#ffffff",
              "800": "#ffffff",
              "900": "#ffffff",
              "foreground": "#000",
              "DEFAULT": "#ffffff"
            },
            "content1": {
              "DEFAULT": "#000000",
              "foreground": "#fff"
            },
            "content2": {
              "DEFAULT": "#27272a",
              "foreground": "#fff"
            },
            "content3": {
              "DEFAULT": "#3f3f46",
              "foreground": "#fff"
            },
            "content4": {
              "DEFAULT": "#52525b",
              "foreground": "#fff"
            },
            "focus": "#49e3ff",
            "overlay": "#ffffff",
            "divider": "#ffffff"
          }
        }
      },
      "layout": {
        "fontSize": {
          "tiny": "0.75rem",
          "small": "0.875rem",
          "medium": "1rem",
          "large": "1.125rem"
        },
        "lineHeight": {
          "tiny": "1rem",
          "small": "1.25rem",
          "medium": "1.5rem",
          "large": "1.75rem"
        },
        "radius": {
          "small": "0.5rem",
          "medium": "0.75rem",
          "large": "0.875rem"
        },
        "borderWidth": {
          "small": "1px",
          "medium": "2px",
          "large": "3px"
        },
        "disabledOpacity": "0.5",
        "dividerWeight": "1",
        "hoverOpacity": "0.9"
      }
    }),
  ],
}



