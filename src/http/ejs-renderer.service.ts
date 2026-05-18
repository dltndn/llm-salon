import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type TemplateLocals = Record<string, unknown>;

@Injectable()
export class EjsRendererService {
  private readonly viewsPath = join(__dirname, 'views');

  async renderView(
    viewName: string,
    locals: TemplateLocals = {},
  ): Promise<string> {
    const body = await this.renderTemplate(viewName, locals);

    return this.renderTemplate('layout', {
      ...locals,
      body,
    });
  }

  private async renderTemplate(
    viewName: string,
    locals: TemplateLocals,
  ): Promise<string> {
    const template = await readFile(
      join(this.viewsPath, `${viewName}.ejs`),
      'utf8',
    );
    const source = this.compile(template);
    const render = new Function(
      'locals',
      'escapeHtml',
      `with (locals) { ${source} }`,
    ) as (locals: TemplateLocals, escapeHtml: (value: unknown) => string) => string;

    return render(locals, escapeHtml);
  }

  private compile(template: string): string {
    let cursor = 0;
    const chunks = ['let output = "";'];
    const pattern = /<%([=-]?)([\s\S]*?)%>/g;

    for (const match of template.matchAll(pattern)) {
      chunks.push(`output += ${JSON.stringify(template.slice(cursor, match.index))};`);

      const marker = match[1];
      const code = match[2];

      if (marker === '=') {
        chunks.push(`output += escapeHtml(${code});`);
      } else if (marker === '-') {
        chunks.push(`output += (${code});`);
      } else {
        chunks.push(code);
      }

      cursor = match.index + match[0].length;
    }

    chunks.push(`output += ${JSON.stringify(template.slice(cursor))};`);
    chunks.push('return output;');

    return chunks.join('\n');
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
