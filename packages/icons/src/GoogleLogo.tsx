import * as React from "react";

export type GoogleLogoProps = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  size?: number;
};

export const GoogleLogo = React.forwardRef<SVGSVGElement, GoogleLogoProps>(
  ({ size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      {...props}
    >
      <path transform="translate(4.5 4.5)" d="Frame" />
    </svg>
  )
);
GoogleLogo.displayName = "GoogleLogo";
