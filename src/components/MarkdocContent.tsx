import Markdoc from "@markdoc/markdoc";
import React from "react";
import { css } from "@linaria/core";

const prose = css`
  font-size: 14px;
  line-height: 1.6;
  color: #222;

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0;
  }

  h1,
  h2,
  h3,
  h4 {
    font-weight: 600;
  }
  h1 {
    font-size: 24px;
    //margin: 24px 0 0;
    margin-top: 0;
  }
  h2 {
    font-size: 20px;
    margin: 20px 0 0;
  }
  h3 {
    font-size: 16px;
    margin: 8px 0 0;
  }
  h4 {
    font-size: 16px;
    margin: 0;
  }

  ul,
  ol {
    //margin: 4px 0;
    margin: 0;
    padding-left: 20px;
  }
  li {
    //margin: 2px 0;
    margin: 0;
  }

  strong {
    font-weight: 600;
  }
  em {
    font-style: italic;
  }

  code {
    font-family: monospace;
    background: #f0f0f0;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 13px;
  }

  pre {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 8px 0;
  }
  pre code {
    background: none;
    padding: 0;
  }

  blockquote {
    border-left: 3px solid #ddd;
    margin: 6px 0;
    padding-left: 12px;
    color: #666;
  }

  a {
    color: #0066cc;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  hr {
    border: none;
    border-top: 1px solid #e0e0e0;
    margin: 12px 0;
  }

  table {
    border-collapse: collapse;
    margin: 8px 0;
  }
  th,
  td {
    padding: 0 20px 0 0;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-weight: 600;
    color: #444;
  }
`;

export default function MarkdocContent({ content }: { content: string }) {
  if (!content.trim()) return null;

  const ast = Markdoc.parse(content);
  const transformed = Markdoc.transform(ast);

  return (
    <div className={prose}>
      {Markdoc.renderers.react(transformed, React) as React.ReactElement}
    </div>
  );
}
