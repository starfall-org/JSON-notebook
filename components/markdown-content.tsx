import { Highlight, type PrismTheme } from "prism-react-renderer";
import React, { type ReactNode, useMemo } from "react";
import { ScrollView, StyleSheet, Text, type TextStyle, View } from "react-native";
import {
  type MarkedStyles,
  Renderer,
  useMarkdown,
  type useMarkdownHookOptions,
} from "react-native-marked";
import { MONO_FONT, type SecretsKeepPalette } from "@/lib/theme";

function prismThemeForPalette(
  palette: SecretsKeepPalette,
  isDark: boolean,
): PrismTheme {
  return {
    plain: {
      color: palette.codeText,
      backgroundColor: palette.codeBg,
    },
    styles: [
      {
        types: ["comment", "prolog", "doctype", "cdata"],
        style: { color: palette.muted, fontStyle: "italic" },
      },
      {
        types: ["property", "tag", "constant", "symbol", "attr-name", "variable"],
        style: { color: isDark ? "#f5f5f4" : "#111111", fontWeight: "600" },
      },
      {
        types: ["string", "char", "attr-value", "inserted"],
        style: { color: isDark ? "#a3be8c" : "#2f5d34" },
      },
      {
        types: ["keyword", "operator", "important"],
        style: { color: isDark ? "#93c5fd" : "#1d4ed8" },
      },
      {
        types: ["number", "boolean", "function"],
        style: { color: isDark ? "#fbbf24" : "#92400e" },
      },
      {
        types: ["punctuation"],
        style: { color: palette.muted },
      },
    ],
  };
}

function normalizeLanguage(language?: string): string {
  const raw = (language || "").trim().toLowerCase();
  if (!raw || raw === "text" || raw === "plain" || raw === "plaintext") {
    return "text";
  }
  if (
    raw === "env" ||
    raw === "dotenv" ||
    raw === "shell" ||
    raw === "sh" ||
    raw === "zsh"
  ) {
    return "bash";
  }
  if (raw === "yml") return "yaml";
  if (raw === "ts") return "typescript";
  if (raw === "js") return "javascript";
  if (raw === "md") return "markdown";
  return raw;
}

export function CodeContentView({
  code,
  language,
  palette,
  isDark,
  compact = false,
}: {
  code: string;
  language?: string;
  palette: SecretsKeepPalette;
  isDark: boolean;
  compact?: boolean;
}) {
  const normalizedLang = normalizeLanguage(language);
  const theme = useMemo(
    () => prismThemeForPalette(palette, isDark),
    [palette, isDark],
  );
  const fontSize = compact ? 12 : 13.5;
  const lineHeight = compact ? 19.5 : 22;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={[
        styles.codeBox,
        {
          backgroundColor: palette.codeBg,
          borderColor: palette.line,
          borderRadius: compact ? 9 : 11,
        },
      ]}
      contentContainerStyle={{
        paddingHorizontal: compact ? 10 : 14,
        paddingVertical: compact ? 12 : 14,
        minWidth: "100%",
      }}
    >
      {normalizedLang === "text" ? (
        <Text
          selectable
          style={{
            color: palette.codeText,
            fontFamily: MONO_FONT,
            fontSize,
            lineHeight,
          }}
        >
          {code}
        </Text>
      ) : (
        <Highlight theme={theme} code={code} language={normalizedLang}>
          {({ tokens, getTokenProps }) => (
            <Text
              selectable
              style={{
                color: palette.codeText,
                fontFamily: MONO_FONT,
                fontSize,
                lineHeight,
              }}
            >
              {tokens.map((line, lineIndex) => (
                <React.Fragment key={lineIndex}>
                  {lineIndex > 0 ? "\n" : null}
                  {line.map((token, tokenIndex) => {
                    const tokenProps = getTokenProps({ token });
                    const tokenStyle = tokenProps.style as
                      | {
                          color?: string;
                          fontStyle?: TextStyle["fontStyle"];
                          fontWeight?: TextStyle["fontWeight"];
                        }
                      | undefined;
                    return (
                      <Text
                        key={tokenIndex}
                        style={{
                          color: tokenStyle?.color || palette.codeText,
                          fontStyle: tokenStyle?.fontStyle,
                          fontWeight: tokenStyle?.fontWeight,
                        }}
                      >
                        {token.content}
                      </Text>
                    );
                  })}
                </React.Fragment>
              ))}
            </Text>
          )}
        </Highlight>
      )}
    </ScrollView>
  );
}

class BlockMarkdownRenderer extends Renderer {
  private readonly palette: SecretsKeepPalette;
  private readonly isDark: boolean;
  private readonly compact: boolean;

  constructor(
    palette: SecretsKeepPalette,
    isDark: boolean,
    compact: boolean,
  ) {
    super({ selectable: true });
    this.palette = palette;
    this.isDark = isDark;
    this.compact = compact;
  }

  override code(text: string, language?: string): ReactNode {
    return (
      <View key={this.getKey()} style={{ marginVertical: 6 }}>
        <CodeContentView
          code={text}
          language={language}
          palette={this.palette}
          isDark={this.isDark}
          compact={this.compact}
        />
      </View>
    );
  }
}

class InlineMarkdownRenderer extends Renderer {
  private readonly baseStyle?: TextStyle;

  constructor(baseStyle?: TextStyle) {
    super({ selectable: true });
    this.baseStyle = baseStyle;
  }

  override paragraph(children: ReactNode[]): ReactNode {
    return (
      <Text key={this.getKey()} selectable style={this.baseStyle}>
        {children}
      </Text>
    );
  }
}

function buildMarkedConfig(
  palette: SecretsKeepPalette,
  compact: boolean,
  overrideTextStyle?: TextStyle,
): { theme: NonNullable<useMarkdownHookOptions["theme"]>; styles: MarkedStyles } {
  const fontSize = (overrideTextStyle?.fontSize as number | undefined) ?? (compact ? 14 : 15);
  const lineHeight =
    (overrideTextStyle?.lineHeight as number | undefined) ?? (compact ? 22 : 24);
  const textColor = (overrideTextStyle?.color as string | undefined) ?? palette.text;

  return {
    theme: {
      colors: {
        background: palette.panel,
        code: palette.codeBg,
        link: palette.strong,
        text: textColor,
        border: palette.line2,
      },
      spacing: {
        xs: 4,
        s: 8,
        m: 12,
        l: 16,
      },
    },
    styles: {
      text: {
        color: textColor,
        fontSize,
        lineHeight,
        fontWeight: overrideTextStyle?.fontWeight,
      },
      strong: {
        color: palette.strong,
        fontWeight: "700",
      },
      em: {
        fontStyle: "italic",
      },
      strikethrough: {
        textDecorationLine: "line-through",
      },
      link: {
        color: palette.strong,
        textDecorationLine: "underline",
        fontWeight: "500",
      },
      codespan: {
        backgroundColor: palette.panel2,
        color: palette.codeText,
        fontFamily: MONO_FONT,
        fontSize: Math.max(12, Math.round(fontSize * 0.88)),
      },
      paragraph: {
        marginVertical: 4,
      },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: palette.line2,
        paddingLeft: 12,
        marginVertical: 6,
      },
      li: {
        color: textColor,
        fontSize,
        lineHeight,
      },
      hr: {
        backgroundColor: palette.line,
        height: 1,
        marginVertical: 10,
      },
      table: {
        borderWidth: 1,
        borderColor: palette.line,
      },
    },
  };
}

export function InlineMarkdownText({
  source,
  style,
  palette,
  isDark = false,
}: {
  source: string;
  style?: TextStyle;
  palette: SecretsKeepPalette;
  isDark?: boolean;
}) {
  const renderer = useMemo(() => new InlineMarkdownRenderer(style), [style]);
  const config = useMemo(
    () => buildMarkedConfig(palette, false, style),
    [palette, style],
  );
  const elements = useMarkdown(source, {
    colorScheme: isDark ? "dark" : "light",
    theme: config.theme,
    styles: config.styles,
    renderer,
  });

  if (!elements.length) {
    return (
      <Text selectable style={style}>
        {source}
      </Text>
    );
  }

  return <>{elements}</>;
}

export function MarkdownContent({
  source,
  palette,
  isDark = false,
  compact = false,
}: {
  source: string;
  palette: SecretsKeepPalette;
  isDark?: boolean;
  compact?: boolean;
}) {
  const renderer = useMemo(
    () => new BlockMarkdownRenderer(palette, isDark, compact),
    [palette, isDark, compact],
  );
  const config = useMemo(
    () => buildMarkedConfig(palette, compact),
    [palette, compact],
  );
  const elements = useMarkdown(source, {
    colorScheme: isDark ? "dark" : "light",
    theme: config.theme,
    styles: config.styles,
    renderer,
  });

  return <View style={{ gap: 2 }}>{elements}</View>;
}

const styles = StyleSheet.create({
  codeBox: {
    borderWidth: 1,
  },
});
