import Markdoc from "@markdoc/markdoc";
import React from "react";
import { css } from "@linaria/core";

const prose = css`
  font-size: 0.9rem;
  line-height: 1.6;
  color: #222;

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0.4em 0;
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 0.6em 0 0.3em;
    font-weight: 600;
  }
  h1 {
    font-size: 1.2em;
  }
  h2 {
    font-size: 1.1em;
  }
  h3 {
    font-size: 1em;
  }

  ul,
  ol {
    margin: 0.3em 0;
    padding-left: 1.4em;
  }
  li {
    margin: 0.15em 0;
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
    padding: 0.1em 0.3em;
    border-radius: 3px;
    font-size: 0.88em;
  }

  pre {
    background: #f5f5f5;
    padding: 0.75em;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  pre code {
    background: none;
    padding: 0;
  }

  blockquote {
    border-left: 3px solid #ddd;
    margin: 0.4em 0;
    padding-left: 0.75em;
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
    margin: 0.75em 0;
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
