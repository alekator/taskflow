/* eslint-disable react/prop-types */
import React from "react";

export default function NextLinkMock({ href, children, ...rest }) {
  const normalizedHref = typeof href === "string" ? href : "#";

  return (
    <a href={normalizedHref} {...rest}>
      {children}
    </a>
  );
}
