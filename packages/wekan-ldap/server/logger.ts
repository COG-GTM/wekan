const isLogEnabled = (process.env.LDAP_LOG_ENABLED === 'true');

function isSensitiveKey(key: string) {
    return /pass(word)?|digest|secret|token|api[-_]?key|authorization|cookie|session/i.test(String(key));
}

function redactSensitiveString(value: string) {
    return String(value).replace(
        /\b(pass(word)?|digest|secret|token|api[-_]?key|authorization|cookie|session)\b\s*([:=])\s*([^\s,;]+)/gi,
        (match, key, _pw, separator) => `${key}${separator}[REDACTED]`
    );
}

// `value` can be any runtime value passed to the logger, so it is typed `any`;
// the return type is likewise `any` (required because the function recurses).
function sanitizeForLogging(value: any): any {
    if (Array.isArray(value)) {
        return value.map(sanitizeForLogging);
    }

    if (typeof value === 'string') {
        return redactSensitiveString(value);
    }

    if (value && typeof value === 'object') {
        const sanitized: Record<string, any> = {};
        Object.keys(value).forEach((key) => {
            if (isSensitiveKey(key)) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = sanitizeForLogging(value[key]);
            }
        });
        return sanitized;
    }

    return value == null ? String(value) : redactSensitiveString(value);
}

// `args` are arbitrary values forwarded to the logger, so they are typed `any[]`.
function log (level: string, ...args: any[]) {
    if (isLogEnabled) {
        const safeMessage = args
            .map((arg) => {
                const sanitized = sanitizeForLogging(arg);
                return (sanitized && typeof sanitized === 'object')
                    ? JSON.stringify(sanitized, null, 2)
                    : sanitized;
            })
            .join(' ');
        console.log(`[${level}] ${safeMessage}`);
    }
}

// The wrappers forward arbitrary values to `log`, so they are typed `any[]`.
function log_debug (...args: any[]) { log('DEBUG', ...args); }
function log_info (...args: any[]) { log('INFO', ...args); }
function log_warn (...args: any[]) { log('WARN', ...args); }
function log_error (...args: any[]) { log('ERROR', ...args); }

export { log, log_debug, log_info, log_warn, log_error };
