import React, { useEffect, useState } from "react";
import App from "../src/App";
export default function WebLayout() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted ? <App /> : null;
}
