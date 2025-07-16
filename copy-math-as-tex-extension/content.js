(function() {
    'use strict';
    console.log("MathJax/KaTeX/LaTeX Copy Helper Extension 1.0: INITIALIZED.");

    // --- Configuration Option ---
    // Set to true to automatically remove \label{...} from copied formulas.
    // Set to false to keep the labels.
    const REMOVE_LABELS = true;

    const DISPLAY_MODE_ENVS = /\\begin{\s*(?:equation|align|gather|multline|flalign|alignat|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|drcases|split|array|tabular)/;

    function findTexSource(element) {
        if (typeof window.MathJax !== 'undefined' && window.MathJax.version.startsWith('3')) {
            if (window.MathJax.startup && window.MathJax.startup.document) {
                const mathDoc = window.MathJax.startup.document;
                for (const mathItem of mathDoc.math) {
                    if (mathItem.typesetRoot && mathItem.typesetRoot === element) {
                        return { source: mathItem.math, isDisplay: mathItem.display };
                    }
                }
            }
        }
        if (typeof window.MathJax !== 'undefined' && window.MathJax.Hub) {
            try {
                const jax = window.MathJax.Hub.getJaxFor(element);
                if (jax) {
                    const isDisplay = jax.root.Get('display') === 'block';
                    const source = jax.originalText;
                    const isEnvDisplay = DISPLAY_MODE_ENVS.test(source);
                    return { source: source, isDisplay: isDisplay || isEnvDisplay };
                }
            } catch (e) {}
        }
        if (element.matches('.ltx_Math')) {
            const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
            if (annotation) {
                const source = annotation.textContent.trim();
                const hasDisplaystyle = (element.getAttribute('alttext') || '').startsWith('\\displaystyle');
                const isInEqnCell = element.closest('.ltx_eqn_cell, .ltx_equation');
                const isEnvDisplay = DISPLAY_MODE_ENVS.test(source);
                return { source: source, isDisplay: hasDisplaystyle || !!isInEqnCell || isEnvDisplay };
            }
        }
        if (element.matches('.katex, .katex-display, .katex--inline, .katex--display')) {
            const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
            if (annotation) {
                const source = annotation.textContent.trim();
                const isDisplay = element.classList.contains('katex-display') || element.classList.contains('katex--display') || DISPLAY_MODE_ENVS.test(source);
                return { source, isDisplay };
            }
            const mathML = element.querySelector('.katex-mathml');
            if (mathML) {
                const source = mathML.textContent.split('\n').map(line => line.trim()).filter(line => line).pop() || '';
                if (source) {
                    const isDisplay = element.classList.contains('katex-display') || element.classList.contains('katex--display') || DISPLAY_MODE_ENVS.test(source);
                    return { source, isDisplay };
                }
            }
        }
        if (element.matches('.MathJax_Display, .MathJax_SVG, .MathJax')) {
             const id = element.id.replace(/_Display$/, '').replace(/[-_]Frame$/, '');
             if (id && id !== element.id) {
                 const script = document.getElementById(id);
                 if (script && script.type.startsWith('math/tex')) {
                     const source = script.textContent.trim();
                     const isDisplay = element.classList.contains('MathJax_Display') || DISPLAY_MODE_ENVS.test(source);
                     return { source, isDisplay };
                 }
             }
        }
        const genericAnnotation = element.querySelector('script[type^="math/tex"], annotation[encoding="application/x-tex"]');
        if (genericAnnotation) {
            const source = genericAnnotation.textContent.trim();
            const isDisplay = (element.getAttribute('display') === 'true') || DISPLAY_MODE_ENVS.test(source);
            return { source, isDisplay };
        }
        return null;
    }

    document.addEventListener('copy', (event) => {
        const selection = window.getSelection();
        if (selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        const ancestor = range.commonAncestorContainer;
        if (!ancestor) return;
        const containers = (ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : document).querySelectorAll('mjx-container, .ltx_Math, .katex--inline, .katex--display, .katex, .MathJax_Display, .MathJax');
        if (containers.length === 0) return;
        const modifiedElements = [];
        try {
            for (const container of containers) {
                if (range.intersectsNode(container)) {
                    if (container.closest('[data-my-temp-tex]')) { continue; }
                    const texData = findTexSource(container);
                    if (texData && texData.source !== null) {
                        container.dataset.myTempTex = texData.source;
                        container.dataset.myTempIsDisplay = texData.isDisplay;
                        modifiedElements.push(container);
                        const previewSibling = container.previousElementSibling;
                        if (previewSibling && previewSibling.matches('.MathJax_Preview') && range.intersectsNode(previewSibling)) {
                            previewSibling.dataset.myTempIgnore = 'true';
                            if (!modifiedElements.includes(previewSibling)) {
                                modifiedElements.push(previewSibling);
                            }
                        }
                    }
                }
            }
            if (modifiedElements.length === 0) { return; }
            const fragment = range.cloneContents();
            const markdownText = processFragment(fragment).replace(/\s*\n\s*/g, '\n').trim();
            if (markdownText) {
                event.preventDefault();
                event.stopPropagation();
                event.clipboardData.setData('text/plain', markdownText);
            }
        } finally {
            for (const el of modifiedElements) {
                delete el.dataset.myTempTex;
                delete el.dataset.myTempIsDisplay;
                delete el.dataset.myTempIgnore;
            }
        }
    }, true);

    function processFragment(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.id === 'small-report-button') { return ''; }
            if (node.classList && node.classList.contains('sr-only')) { return ''; }
            if (node.tagName === 'SCRIPT') { return ''; }
            if (node.dataset.myTempIgnore === 'true') { return ''; }
            if (node.dataset.myTempTex) {
                let texSource = node.dataset.myTempTex.trim();
                const isBlock = node.dataset.myTempIsDisplay === 'true';

                if (REMOVE_LABELS) {
                    texSource = texSource.replace(/\\label\s*\{.*?\}/g, '').trim();
                }

                return isBlock ? `\n\n$$${texSource}$$\n\n` : ` $${texSource}$ `;
            }
        }

        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');
        }

        if (node.childNodes && node.childNodes.length > 0) {
            let text = '';
            for (const child of node.childNodes) {
                text += processFragment(child);
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                const isBlockElement = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|TR)$/.test(node.tagName);
                if (isBlockElement && text.length > 0 && !text.endsWith('\n')) {
                    text += '\n';
                }
            }
            return text;
        }
        return '';
    }
})();