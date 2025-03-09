import Image from "next/image";

export const Logo: React.FC<{ size?: number; height?: number }> = ({ size = 32, height, ...props }) => (
  <Image
    src="/dorado-logo.png" // Ensure this file exists in the `public` folder
    width={size}
    height={height || size}
    alt="Dorado Metals Exchange Logo"
    {...props}
  />
);