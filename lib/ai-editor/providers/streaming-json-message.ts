export class StreamingJsonMessageExtractor {
  private raw = ''
  private messageStarted = false
  private messageEnded = false
  private valueCursor = 0
  private escapePending = false
  private unicodePending = false
  private unicodeBuffer = ''

  feed(chunk: string) {
    if (!chunk) return ''

    this.raw += chunk

    if (!this.messageStarted) {
      const match = /"message"\s*:\s*"/.exec(this.raw)
      if (!match) {
        return ''
      }

      this.messageStarted = true
      this.valueCursor = match.index + match[0].length
    }

    if (this.messageEnded) {
      return ''
    }

    let output = ''

    while (this.valueCursor < this.raw.length) {
      const char = this.raw[this.valueCursor]
      this.valueCursor += 1

      if (this.unicodePending) {
        this.unicodeBuffer += char
        if (this.unicodeBuffer.length === 4) {
          const codePoint = Number.parseInt(this.unicodeBuffer, 16)
          if (Number.isFinite(codePoint)) {
            output += String.fromCodePoint(codePoint)
          }
          this.unicodePending = false
          this.unicodeBuffer = ''
        }
        continue
      }

      if (this.escapePending) {
        this.escapePending = false

        if (char === 'u') {
          this.unicodePending = true
          this.unicodeBuffer = ''
          continue
        }

        output += decodeJsonEscape(char)
        continue
      }

      if (char === '\\') {
        this.escapePending = true
        continue
      }

      if (char === '"') {
        this.messageEnded = true
        break
      }

      output += char
    }

    return output
  }
}

function decodeJsonEscape(char: string) {
  switch (char) {
    case '"':
      return '"'
    case '\\':
      return '\\'
    case '/':
      return '/'
    case 'b':
      return '\b'
    case 'f':
      return '\f'
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    default:
      return char
  }
}
