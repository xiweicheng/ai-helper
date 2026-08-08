// browser-tools - page interaction + form operation + content extraction tool definitions

export const BROWSER_TOOLS = [
  {
    id: 'interact_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'interact_element',
      description: 'Click or hover on a page element. Locate via ref (recommended, from query_elements), text, or CSS selector',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['click', 'hover'] },
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          ref: { type: 'integer', description: 'Index returned by query_elements (recommended); valid only on current page, re-query after navigation' },
          text: { type: 'string', description: 'Match element by text (e.g. "Login"), click on first match' },
          tag: { type: 'string', description: 'Restrict tag with text, e.g. button/a' },
          selector: { type: 'string', description: 'CSS selector (used when neither ref nor text provided); avoid long nth-child chains, prefer selector returned by query_elements' },
          waitTime: { type: 'integer' },
          timeout: { type: 'integer' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'scroll_to',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'scroll_to',
      description: 'Scroll page to a target. Use scroll_collect for infinite scroll collection',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          target: { type: 'string', enum: ['selector', 'top', 'bottom', 'coordinates', 'text'], description: 'Scroll target type; selector→requires selector, coordinates→requires x/y, text→requires text' },
          selector: { type: 'string' },
          text: { type: 'string', description: 'When target=text, scroll to element containing this text' },
          x: { type: 'integer' },
          y: { type: 'integer' },
          align: { type: 'string', enum: ['start', 'center', 'end', 'nearest'] },
          behavior: { type: 'string', enum: ['smooth', 'auto'] },
          maxScrolls: { type: 'integer', description: 'When target=text, max scroll attempts (default 20)' },
          pauseMs: { type: 'integer', description: 'When target=text, wait ms after each scroll (default 500)' }
        },
        required: []
      }
    }
  },
  {
    id: 'wait_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'wait_element',
      description: 'Wait for an element to appear/disappear/become visible/hidden. For page navigation, use wait_navigation',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          selector: { type: 'string' },
          state: { type: 'string', enum: ['appeared', 'disappeared', 'visible', 'hidden'] },
          timeout: { type: 'integer' }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'drag_drop',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'drag_drop',
      description: 'Drag element (⚠️ experimental, may not work on most pages; use click instead if needed)',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          sourceSelector: { type: 'string' },
          targetSelector: { type: 'string' }
        },
        required: ['sourceSelector', 'targetSelector']
      }
    }
  },
  {
    id: 'wait_navigation',
    category: 'page_interaction',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'wait_navigation',
      description: 'Wait for navigation',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          timeout: { type: 'integer' },
          waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] }
        },
        required: []
      }
    }
  },
  {
    id: 'handle_dialog',
    category: 'page_interaction',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'handle_dialog',
      description: 'Handle page dialogs (alert/confirm/prompt). Use BEFORE an action that triggers a dialog. accept=auto-confirm, dismiss=auto-cancel, restore=revert to native behavior',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          action: { type: 'string', enum: ['accept', 'dismiss', 'restore'], description: 'accept: auto-OK/Allow; dismiss: auto-Cancel/Block; restore: revert to native dialogs' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'fill_form',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'fill_form',
      description: 'Fill multiple form fields at once. For single-field input on React/Vue apps (controlled components), prefer keyboard_input',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string' },
                value: { type: 'string' },
                fieldType: { type: 'string', enum: ['text', 'select', 'checkbox', 'radio', 'contenteditable'] }
              },
              required: ['selector', 'value']
            }
          },
          waitTime: { type: 'integer' }
        },
        required: ['fields']
      }
    }
  },
  {
    id: 'keyboard_input',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'keyboard_input',
      description: 'Type text or dispatch a key event into the focused element. Bypasses React/Vue controlled components. text=type into field, key=single key like Enter/Escape',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          key: { type: 'string' },
          text: { type: 'string' },
          ctrlKey: { type: 'boolean' },
          shiftKey: { type: 'boolean' },
          altKey: { type: 'boolean' }
        },
        required: []
      }
    }
  },
  {
    id: 'file_upload',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'file_upload',
      description: 'Upload file',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          selector: { type: 'string' },
          fileName: { type: 'string' },
          fileContent: { type: 'string', description: 'File content (base64)' },
          fileType: { type: 'string', description: 'MIME type, e.g. image/png' }
        },
        required: ['selector', 'fileName', 'fileContent']
      }
    }
  },
  {
    id: 'select_dropdown',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'select_dropdown',
      description: 'Dropdown selection (also supports custom components; trigger can use ref instead of triggerSelector)',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          ref: { type: 'integer', description: 'Index returned by query_elements (takes precedence over triggerSelector)' },
          triggerSelector: { type: 'string' },
          optionText: { type: 'string' },
          optionSelector: { type: 'string' },
          timeout: { type: 'integer' }
        },
        required: ['optionText']
      }
    }
  },
  {
    id: 'page_content',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'page_content',
      description: 'Get page text or HTML content. For structured data (tables/links/images), use extract_data. For interactive elements, use query_elements',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          format: { type: 'string', enum: ['text', 'html'] },
          selector: { type: 'string' },
          maxLength: { type: 'integer' }
        },
        required: []
      }
    }
  },
  {
    id: 'extract_data',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_data',
      description: 'Extract structured data from page',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          dataType: { type: 'string', enum: ['table', 'metadata', 'links', 'forms', 'images'], description: 'table→HTML tables, metadata→meta/SEO tags, links→hyperlinks, forms→form elements, images→image elements' },
          selector: { type: 'string' },
          filterType: { type: 'string', enum: ['all', 'internal', 'external'], description: 'links only: filter by link target' },
          includeHeaders: { type: 'boolean', description: 'table only: include header row' },
          format: { type: 'string', enum: ['json', 'markdown'], description: 'table only: output format' },
          includeImages: { type: 'boolean', description: 'links only: include images as links' },
          minWidth: { type: 'integer', description: 'images only: min width filter' },
          minHeight: { type: 'integer', description: 'images only: min height filter' },
          maxResults: { type: 'integer' }
        },
        required: ['dataType']
      }
    }
  },
  {
    id: 'query_elements',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'query_elements',
      description: 'Query interactive elements (buttons, inputs, links, etc). Returns ref numbers for use in interact_element/fill_form. Recommended as the primary element locating method',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          filterByText: { type: 'string' },
          elementTypes: {
            type: 'array',
            items: { type: 'string', enum: ['button', 'input', 'select', 'textarea', 'a', 'checkbox', 'radio', 'menuitem'] }
          },
          maxResults: { type: 'integer' },
          countOnly: { type: 'boolean' }
        },
        required: []
      }
    }
  },
  {
    id: 'search_in_page',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_in_page',
      description: 'Find text in current page content',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          query: { type: 'string' },
          mode: { type: 'string', enum: ['plain', 'regex'] },
          caseSensitive: { type: 'boolean' },
          contextLength: { type: 'integer' },
          maxResults: { type: 'integer' },
          highlight: { type: 'boolean' }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'iframe_content',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'iframe_content',
      description: 'Get content of an iframe embedded in the page',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          selector: { type: 'string' },
          includeNested: { type: 'boolean' },
          maxLength: { type: 'integer' }
        },
        required: []
      }
    }
  },
  {
    id: 'scroll_collect',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'scroll_collect',
      description: 'Scroll page and collect content incrementally. Use for infinite scroll or lazy-loaded pages',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          scrollPixels: { type: 'integer' },
          maxScrolls: { type: 'integer' },
          pauseMs: { type: 'integer' },
          selector: { type: 'string' }
        },
        required: []
      }
    }
  },
];
