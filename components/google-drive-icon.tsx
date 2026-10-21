import React from "react";
import Svg, { Path } from "react-native-svg";

export function GoogleDriveIcon({
  size = 18,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
    >
      <Path d="M8.2 4h7.6l5 8.7-3.8 6.6H7l-3.8-6.6L8.2 4Z" />
      <Path d="m8.2 4 5 8.7" />
      <Path d="M20.8 12.7H13.2" />
      <Path d="M7 19.3l6.2-6.6" />
    </Svg>
  );
}
