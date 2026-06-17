import { Injectable } from "@nestjs/common";
import removeMarkdown from "remove-markdown";

@Injectable()
export class MarkdownParserService {
  parse(markdown: string): string {
    return removeMarkdown(markdown);
  }
}