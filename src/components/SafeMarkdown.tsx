import React from 'react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

export default function SafeMarkdown({ content, className = '' }: SafeMarkdownProps) {
  if (!content) return null;

  // Sanitizar URL para enlaces
  const sanitizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
      return trimmed;
    }
    return '#';
  };

  // Parsear texto en una línea para negritas, cursivas y enlaces
  const parseInlineStyles = (text: string): React.ReactNode[] => {
    // Regex para encontrar [texto](url), **negrita**, *cursiva*
    // Para simplificar, recorremos por tokens/regex de manera segura
    const tokens: React.ReactNode[] = [];
    let keyIndex = 0;

    // Patrón combinado para buscar negritas, cursivas y enlaces
    // Grupo 1: Negrita (**...**)
    // Grupo 2: Cursiva (*...*)
    // Grupo 3: Texto de enlace y Grupo 4: URL de enlace ([text](url))
    const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let match;
    let lastIndex = 0;

    // Reiniciamos el índice de regex
    regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;

      // Texto plano antes del match
      if (matchIndex > lastIndex) {
        tokens.push(<span key={`text-${keyIndex++}`}>{text.substring(lastIndex, matchIndex)}</span>);
      }

      if (match[1]) {
        // Negrita
        tokens.push(<strong key={`bold-${keyIndex++}`} className="font-bold">{match[2]}</strong>);
      } else if (match[3]) {
        // Cursiva
        tokens.push(<em key={`italic-${keyIndex++}`} className="italic">{match[4]}</em>);
      } else if (match[5]) {
        // Enlace
        const linkText = match[6];
        const linkUrl = sanitizeUrl(match[7]);
        tokens.push(
          <a
            key={`link-${keyIndex++}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary hover:text-brand-secondary underline transition-colors"
          >
            {linkText}
          </a>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      tokens.push(<span key={`text-end-${keyIndex++}`}>{text.substring(lastIndex)}</span>);
    }

    return tokens;
  };

  // Dividir el texto en bloques de párrafo y listas
  const rawLines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let listKeyIndex = 0;

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();

    // Comprobar si es un ítem de lista (- o *)
    const isListItem = trimmed.startsWith('- ') || trimmed.startsWith('* ');

    if (isListItem) {
      const itemText = trimmed.substring(2);
      currentList.push(
        <li key={`li-${index}`} className="list-disc ml-5 mb-1 font-light leading-relaxed">
          {parseInlineStyles(itemText)}
        </li>
      );
    } else {
      // Si veníamos acumulando una lista, la cerramos y agregamos a los bloques
      if (currentList.length > 0) {
        blocks.push(
          <ul key={`ul-${listKeyIndex++}`} className="mb-4 space-y-1">
            {currentList}
          </ul>
        );
        currentList = [];
      }

      // Si la línea está vacía, agregamos un espaciado o un salto de párrafo
      if (trimmed === '') {
        blocks.push(<div key={`empty-${index}`} className="h-2" />);
      } else if (trimmed.startsWith('### ')) {
        blocks.push(
          <h4 key={`h4-${index}`} className="text-base font-bold mt-4 mb-2">
            {parseInlineStyles(trimmed.substring(4))}
          </h4>
        );
      } else if (trimmed.startsWith('## ')) {
        blocks.push(
          <h3 key={`h3-${index}`} className="text-lg font-bold mt-5 mb-2">
            {parseInlineStyles(trimmed.substring(3))}
          </h3>
        );
      } else if (trimmed.startsWith('# ')) {
        blocks.push(
          <h2 key={`h2-${index}`} className="text-xl font-extrabold mt-6 mb-3">
            {parseInlineStyles(trimmed.substring(2))}
          </h2>
        );
      } else {
        blocks.push(
          <p key={`p-${index}`} className="mb-4 font-light leading-relaxed">
            {parseInlineStyles(line)}
          </p>
        );
      }
    }
  });

  // Si queda una lista al final de las líneas, la agregamos
  if (currentList.length > 0) {
    blocks.push(
      <ul key={`ul-${listKeyIndex++}`} className="mb-4 space-y-1">
        {currentList}
      </ul>
    );
  }

  return <div className={`prose-custom ${className}`}>{blocks}</div>;
}
