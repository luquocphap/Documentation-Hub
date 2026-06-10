export const generateHtmlDocument = (rawHtml) => {
    const fullHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { 
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 11pt;
                    padding: 40px; 
                    line-height: 1.6; 
                    color: #333; 
                }
              h1, h2, h3 { color: #111; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
              code { background: #f6f8fa; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
              pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
              blockquote { border-left: 4px solid #dfe2e5; margin: 0; padding-left: 16px; color: #6a737d; }
              table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
              table, th, td { border: 1px solid #dfe2e5; }
              th, td { padding: 8px 12px; }
              img { max-width: 100%; }
            </style>
          </head>
          <body>
            ${rawHtml}
          </body>
          </html>
        `;

    return fullHtml;
}