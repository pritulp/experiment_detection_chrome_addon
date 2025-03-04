(function() {
    // Check if script is already injected
    if (window.experimentDetectorInjected) {
        return;
    }
    window.experimentDetectorInjected = true;

    // Platform signatures with simple patterns
    const PLATFORMS = {
        eppo: /\b(?:eppo|eppo[_-]client|eppo[_-]sdk)\b/i,
        
        statsig: /\b(?:statsig|statsig[_-]sdk|statsig[_-]client)\b/i,
        
        optimizely: /\b(?:optimizely|optimizely[_-]experiment|optimizely[_-]client)\b/i,
        
        vwo: /\b(?:vwo|visual[_-]website[_-]optimizer|vwo[_-]code)\b/i,
        
        googleOptimize: /\b(?:google[_-]optimize|optimize\.google)\b/i,
        
        launchDarkly: /\b(?:launchdarkly|ld[_-]client)\b/i,
        
        split: /\b(?:split\.io|splitio|split[_-]sdk)\b/i,
        
        amplitude: /\b(?:amplitude|amplitude[_-]sdk)\b/i,
        
        abtasty: /\b(?:abtasty|ab[_-]tasty)\b/i,
        
        convert: /\b(?:convert\.com|convert[_-]experiments)\b/i,
        
        adobe: /\b(?:adobe[_-]target|at\.js|mbox\.js|tt\.omtrdc\.net)\b/i,
        
        growthbook: /\b(?:growthbook|gb[_-]experiment|growthbook[_-]sdk)\b/i
    };

    // Keywords that suggest experimentation
    const EXPERIMENTATION_KEYWORDS = [
        'experiment',
        'test',
        'variant',
        'group',
        'treatment',
        'control',
        'feature',
        'rollout',
        'forced',
        'ab test',
        'a/b test'
    ];

    // More specific experiment-related patterns
    const EXPERIMENT_PATTERNS = [
        {
            type: 'experiment',
            pattern: /["'](?:experiment(?:Id|Name|Key)|ab_test|test(?:Id|Name|Key))["']\s*:\s*["']([^"']+)["']/gi
        },
        {
            type: 'variant',
            pattern: /["'](?:variant(?:Id|Name)|variation|group)["']\s*:\s*["']([^"']+)["']/gi
        },
        {
            type: 'feature_flag',
            pattern: /["'](?:feature_(?:flag|gate)|flag_key|gate_name)["']\s*:\s*["']([^"']+)["']/gi
        },
        {
            type: 'treatment',
            pattern: /["'](?:treatment|bucket)["']\s*:\s*["']([^"']+)["']/gi
        }
    ];

    // Platform-specific experiment patterns
    const PLATFORM_EXPERIMENT_EXTRACTORS = {
        eppo: {
            pattern: /(?:get(?:Boolean|String|Numeric|JSON)Assignment\(\s*["']([^"']+)["']|["']flag_key["']\s*:\s*["']([^"']+)["'])/g,
            validate: (script) => {
                return script.includes('eppo') || 
                       script.includes('eppo_client') || 
                       script.includes('EppoClient') ||
                       script.includes('eppo-server-sdk') ||
                       script.includes('eppo-client-sdk');
            }
        },
        statsig: {
            pattern: /(?:["']([^"':]+):(\d+(?:\.\d+)?):(\d+)["']|"feature_gates":[{[^}]+}]|"statsig_stable_id"|statsig\.checkGate\(["']([^"']+)["']\)|statsig\.getExperiment\(["']([^"']+)["']\)|"sdkType"\s*:\s*"statsig-[^"]+"|"sdkVersion"\s*:\s*"[^"]+")/g,
            validate: (script) => {
                // Enhanced validation for Statsig
                const indicators = [
                    'statsig',
                    'StatsigClient',
                    'statsig-node-sdk',
                    'statsig-node',
                    'WebAnonymousCookieID',
                    'statsig.initialize',
                    'statsig.checkGate',
                    'statsig.getExperiment',
                    'statsig.getConfig',
                    'statsig.getLayer',
                    '__STATSIG_METADATA__',
                    'statsig_stable_id',
                    'statsig_id',
                    'StatsigProvider',
                    'useStatsig',
                    'sdkType',
                    'sdkVersion',
                    'statsig_updates',
                    'generator',
                    'statsig_server_sdk'
                ];
                
                // Score-based validation with higher weight for server-side indicators
                let score = 0;
                indicators.forEach(indicator => {
                    if (script.includes(indicator)) {
                        // Higher score for server-side indicators
                        if (['statsig-node', 'statsig_server_sdk', 'sdkType', 'generator'].includes(indicator)) {
                            score += 3;
                        }
                        // Medium score for SDK-related indicators
                        else if (indicator.includes('sdk') || indicator.includes('SDK')) {
                            score += 2;
                        }
                        // Base score for other indicators
                        else {
                            score += 1;
                        }
                    }
                });

                // Additional check for SDK information pattern
                const sdkPattern = /"sdkType"\s*:\s*"statsig-[^"]+"\s*,\s*"sdkVersion"\s*:\s*"[^"]+"/;
                if (sdkPattern.test(script)) {
                    score += 5;
                }

                // Check for server-side specific patterns
                const serverSidePattern = /"statsig_updates"|"generator"|"statsig-node-sdk"|"sdkInfo"/;
                if (serverSidePattern.test(script)) {
                    score += 4;
                }

                return score >= 3 || 
                       script.includes('statsig.initialize') || 
                       script.includes('statsig.checkGate') ||
                       script.includes('StatsigProvider') ||
                       sdkPattern.test(script);
            }
        },
        optimizely: {
            pattern: /["']experimentId["']\s*:\s*["']([^"']+)["'].*?["']variationName["']\s*:\s*["']([^"']+)["']/g,
            validate: (script) => script.includes('optimizely')
        },
        abtasty: {
            pattern: /ABTasty\.getTestsOnPage\(\)|_abtasty\.tests|ABTastyData\s*=\s*({[^}]+})/g,
            validate: (script) => script.includes('abtasty') || script.includes('ABTasty')
        },
        convert: {
            pattern: /convert\.currentData|_conv_q\.push|data-conv-variation|convert\.experiments/g,
            validate: (script) => script.includes('convert.com') || script.includes('_conv_q')
        },
        adobe: {
            pattern: /(?:mboxCreate\(['"]([^'"]+)['"]\)|(?:adobe|window)\.target\.getOffer\([^)]*["']([^'"]+)["']\)|tgt:([^,}]+))/g,
            validate: (script) => {
                // Score-based validation system
                let score = 0;
                
                // Strong indicators (2 points each)
                if (script.includes('.tt.omtrdc.net')) score += 2;
                if (script.match(/mbox(?:Create|Define|Update)\s*\(/)) score += 2;
                if (script.match(/\.target\.(?:getOffer|applyOffer)\b/)) score += 2;
                if (script.includes('targetGlobalSettings')) score += 2;
                
                // Medium indicators (1 point each)
                if (script.includes('at.js')) score += 1;
                if (script.includes('mbox.js')) score += 1;
                if (script.match(/mbox(?:PC|Session)\b/)) score += 1;
                if (script.includes('serverState')) score += 1;
                if (script.includes('mboxDefault')) score += 1;
                
                // Weak indicators (0.5 points each)
                if (script.match(/\btgt1?\b/)) score += 0.5;
                if (script.match(/\bvpc\b/)) score += 0.5;
                
                // Require a minimum score and at least one strong indicator
                return score >= 2.5 && (
                    script.includes('.tt.omtrdc.net') ||
                    script.match(/mbox(?:Create|Define|Update)\s*\(/) ||
                    script.match(/\.target\.(?:getOffer|applyOffer)\b/) ||
                    script.includes('targetGlobalSettings')
                );
            }
        }
    };

    // Generic experiment detection patterns (fallback)
    const GENERIC_EXPERIMENT_PATTERNS = [
        {
            type: 'experiment',
            pattern: /["'](?:experiment(?:Id|Name|Key)|ab_test|test(?:Id|Name|Key))["']\s*:\s*["']([^"']+)["']/gi
        },
        {
            type: 'variant',
            pattern: /["'](?:variant(?:Id|Name)|variation|group)["']\s*:\s*["']([^"']+)["']/gi
        },
        {
            type: 'feature_flag',
            pattern: /["'](?:feature_(?:flag|gate)|flag_key|gate_name)["']\s*:\s*["']([^"']+)["']/gi
        },
        {
            type: 'treatment',
            pattern: /["'](?:treatment|bucket)["']\s*:\s*["']([^"']+)["']/gi
        }
    ];

    // User identification patterns
    const USER_ID_PATTERNS = {
        eppo: {
            userID: /["']subject_?key["']\s*:\s*["']([^"']+)["']/,
            userProps: /["']user_?properties["']\s*:\s*({[^}]+})/,
            defaultValue: /["']default_?value["']\s*:\s*([^,}\s]+)/,
            sdkKey: /eppo_client\.init\(\s*["']([^"']+)["']/
        },
        statsig: {
            userID: /["']user_id["']\s*:\s*["']([^"']+)["']/,
            stableID: /["']statsig_stable_id["']\s*:\s*["']([^"']+)["']/,
            cookieID: /WebAnonymousCookieID\s*=\s*["']([^"']+)["']/,
            hashMethod: /["']hash_used["']\s*:\s*["']([^"']+)["']/
        },
        optimizely: {
            userID: /["']optimizelyEndUserId["']\s*:\s*["']([^"']+)["']/,
            visitorID: /["']visitor_id["']\s*:\s*["']([^"']+)["']/,
            bucketingID: /["']bucketing_id["']\s*:\s*["']([^"']+)["']/
        },
        convert: {
            userID: /convert_temp_user\s*=\s*["']([^"']+)["']/,
            visitorID: /["']visitor_id["']\s*:\s*["']([^"']+)["']/
        },
        abtasty: {
            visitorID: /ABTasty\.getVisitorID\(\)/,
            userID: /["']visitor_id["']\s*:\s*["']([^"']+)["']/
        },
        adobe: {
            mboxPC: /mbox(?:PC|Session)\s*=\s*["']([^"']+)["']/,
            visitorID: /visitor\.marketingCloudVisitorID/,
            targetPageParams: /targetPageParams\s*=\s*function\s*\(\s*\)\s*{([^}]+)}/,
        }
    };

    // Tag Management Systems and Analytics signatures
    const TAG_MANAGEMENT_SIGNATURES = {
        'Adobe Launch': {
            patterns: [
                /assets\.adobedtm\.com\/launch-[A-Za-z0-9]+\.min\.js/,
                /launch-[A-Za-z0-9-]+\.min\.js/,
                /_satellite\.track/,
                /digitalData/
            ],
            validate: (script) => script.includes('_satellite') || script.includes('adobedtm.com')
        },
        'Google Tag Manager': {
            patterns: [
                /googletagmanager\.com\/gtm\.js/,
                /gtm\.js\?id=/,
                /dataLayer\s*=\s*\[\]/,
                /gtag\(/
            ],
            validate: (script) => script.includes('dataLayer') || script.includes('gtag')
        },
        'Tealium': {
            patterns: [
                /tags\.tiqcdn\.com/,
                /utag\.js/,
                /utag\.view/,
                /utag\.data/
            ],
            validate: (script) => script.includes('utag')
        },
        'Segment': {
            patterns: [
                /cdn\.segment\.com\/analytics\.js/,
                /analytics\.load/,
                /analytics\.page/,
                /analytics\.track/
            ],
            validate: (script) => script.includes('analytics.load') || script.includes('analytics.track')
        },
        'Ensighten': {
            patterns: [
                /nexus\.ensighten\.com/,
                /Bootstrap\.js/,
                /Bootstrapper\.js/
            ],
            validate: (script) => script.includes('ensighten')
        }
    };

    // Analytics tool signatures
    const ANALYTICS_SIGNATURES = {
        'Adobe Analytics': {
            patterns: [
                /s\.t\(\)/,
                /s\.tl\(\)/,
                /AppMeasurement\.js/,
                /sc\.omtrdc\.net/,
                /s_code\.js/
            ],
            validate: (script) => script.includes('s.t()') || script.includes('AppMeasurement')
        },
        'Google Analytics': {
            patterns: [
                /google-analytics\.com\/analytics\.js/,
                /ga\('send'/,
                /gtag\('config'/,
                /UA-[0-9]+-[0-9]+/,
                /G-[A-Z0-9]+/
            ],
            validate: (script) => script.includes('ga(') || script.includes('gtag(')
        },
        'Mixpanel': {
            patterns: [
                /mixpanel\.track/,
                /cdn\.mxpnl\.com/,
                /mixpanel\.init/
            ],
            validate: (script) => script.includes('mixpanel')
        },
        'Amplitude': {
            patterns: [
                /amplitude\.getInstance/,
                /api\.amplitude\.com/,
                /amplitude\.init/
            ],
            validate: (script) => script.includes('amplitude')
        }
    };

    // Function to safely execute regex matches
    function safeRegexMatch(pattern, text) {
        try {
            return Array.from(text.matchAll(pattern));
        } catch (e) {
            console.error('Error in regex matching:', e);
            // Fallback to match if matchAll fails
            try {
                const matches = [];
                let match;
                while ((match = pattern.exec(text)) !== null) {
                    matches.push(match);
                }
                return matches;
            } catch (e) {
                console.error('Error in fallback regex matching:', e);
                return [];
            }
        }
    }

    // Function to detect user identification method
    function detectUserIdentification(pageContent, platform) {
        const idMethods = [];
        const patterns = USER_ID_PATTERNS[platform];
        
        if (!patterns) return null;

        Object.entries(patterns).forEach(([method, pattern]) => {
            const match = pageContent.match(pattern);
            if (match) {
                idMethods.push({
                    type: method,
                    // Don't expose actual IDs for privacy/security
                    present: true,
                    // Include hash method if available
                    hashMethod: method === 'hashMethod' ? match[1] : undefined
                });
            }
        });

        return idMethods.length > 0 ? idMethods : null;
    }

    // Function to check if match is from a resource URL or marketing content
    function isResourceOrMarketingMatch(match, context) {
        const lowerContext = context.toLowerCase();
        const matchPosition = lowerContext.indexOf(match.toLowerCase());
        if (matchPosition === -1) return false;

        // Check if match is part of a URL, src, href, or other resource attributes
        const urlPattern = /(?:src|href|url|source|path|asset)=["']([^"']*\b${match}\b[^"']*)["']/i;
        if (urlPattern.test(context)) return true;

        // Check if match is within an img tag
        const imgPattern = /<img[^>]*\b${match}\b[^>]*>/i;
        if (imgPattern.test(context)) return true;

        // Check if match is within common marketing/documentation elements
        const marketingSelectors = ['pricing', 'competitor', 'alternative', 'comparison', 'vs', 'versus', 'integrate'];
        const nearbyContent = context.slice(Math.max(0, matchPosition - 50), matchPosition + match.length + 50);
        return marketingSelectors.some(selector => nearbyContent.includes(selector));
    }

    // Function to detect tag management systems
    function detectTagManagement(pageContent) {
        const detectedTMS = [];
        
        Object.entries(TAG_MANAGEMENT_SIGNATURES).forEach(([tms, { patterns, validate }]) => {
            patterns.forEach(pattern => {
                const matches = pageContent.match(pattern);
                if (matches) {
                    const validMatches = matches.filter(match => !isResourceOrMarketingMatch(match, pageContent));
                    if (validMatches.length > 0 && validate(pageContent)) {
                        if (!detectedTMS.some(t => t.name === tms)) {
                            detectedTMS.push({
                                name: tms,
                                type: 'tag_manager',
                                source: pattern.toString()
                            });
                        }
                    }
                }
            });
        });

        return detectedTMS;
    }

    // Function to detect analytics tools
    function detectAnalytics(pageContent) {
        const detectedAnalytics = [];
        
        Object.entries(ANALYTICS_SIGNATURES).forEach(([tool, { patterns, validate }]) => {
            patterns.forEach(pattern => {
                const matches = pageContent.match(pattern);
                if (matches) {
                    const validMatches = matches.filter(match => !isResourceOrMarketingMatch(match, pageContent));
                    if (validMatches.length > 0 && validate(pageContent)) {
                        if (!detectedAnalytics.some(t => t.name === tool)) {
                            detectedAnalytics.push({
                                name: tool,
                                type: 'analytics',
                                source: pattern.toString()
                            });
                        }
                    }
                }
            });
        });

        return detectedAnalytics;
    }

    // Function to detect platforms and experiments from page source
    async function detectExperiments() {
        console.log('Starting detection');
        const pageText = document.documentElement.innerText;
        const pageSource = document.documentElement.innerHTML;
        const detectedPlatforms = [];
        const experiments = [];
        let hasExperimentKeywords = false;

        // First pass: Look for experimentation keywords
        EXPERIMENTATION_KEYWORDS.forEach(keyword => {
            if (pageText.toLowerCase().includes(keyword.toLowerCase()) || pageSource.toLowerCase().includes(keyword.toLowerCase())) {
                hasExperimentKeywords = true;
            }
        });

        // Detect tag management systems and analytics tools
        const tagManagers = detectTagManagement(pageSource);
        const analyticsTools = detectAnalytics(pageSource);

        // Check for GrowthBook
        try {
            // Check for GrowthBook in window object
            if (window.growthbook || window.GrowthBook || window.growthbookHelpers || document.getElementById('growthbook-helpers')) {
                console.log('Found GrowthBook');
                if (!detectedPlatforms.some(p => p.name === 'growthbook')) {
                    detectedPlatforms.push({
                        name: 'growthbook',
                        type: 'script',
                        source: 'GrowthBook SDK'
                    });
                }

                // Try to extract GrowthBook experiments from window object
                if (window.growthbook) {
                    try {
                        const gbInstance = window.growthbook;
                        const activeExperiments = gbInstance.getActiveExperiments?.() || [];
                        activeExperiments.forEach(exp => {
                            if (!experiments.some(e => e.id === exp.key)) {
                                experiments.push({
                                    platform: 'GrowthBook',
                                    id: exp.key,
                                    name: exp.key,
                                    variation: exp.variation,
                                    type: 'experiment',
                                    identificationMethods: [{ type: 'sdk' }]
                                });
                            }
                        });
                    } catch (e) {
                        console.error('Error extracting GrowthBook experiments:', e);
                    }
                }

                // Check for GrowthBook data in localStorage
                try {
                    const storageKeys = Object.keys(localStorage);
                    const gbKeys = storageKeys.filter(key => key.includes('growthbook') || key.includes('gb-'));
                    gbKeys.forEach(key => {
                        try {
                            const data = JSON.parse(localStorage.getItem(key));
                            if (data && typeof data === 'object') {
                                Object.entries(data).forEach(([expKey, value]) => {
                                    if (!experiments.some(e => e.id === expKey)) {
                                        experiments.push({
                                            platform: 'GrowthBook',
                                            id: expKey,
                                            name: expKey,
                                            variation: typeof value === 'object' ? value.variation || 'Unknown' : value,
                                            type: 'experiment',
                                            identificationMethods: [{ type: 'localStorage' }]
                                        });
                                    }
                                });
                            }
                        } catch (e) {
                            console.error('Error parsing GrowthBook localStorage data:', e);
                        }
                    });
                } catch (e) {
                    console.error('Error checking GrowthBook localStorage:', e);
                }
            }
        } catch (e) {
            console.error('Error checking for GrowthBook:', e);
        }

        // Check for Split.io
        try {
            // Check for Split.io in window object and SDK
            if (window.splitio || window.split || document.querySelector('script[src*="split.io"], script[src*="chunk-split"]')) {
                console.log('Found Split.io');
                if (!detectedPlatforms.some(p => p.name === 'split')) {
                    detectedPlatforms.push({
                        name: 'split',
                        type: 'script',
                        source: 'Split.io SDK'
                    });
                }

                // Try to extract Split.io experiments from window object
                if (window.splitio) {
                    try {
                        // Check for Split.io factory and client
                        const factory = window.splitio?.factory;
                        const client = factory?.client?.();
                        
                        if (client) {
                            // Get all feature flags/treatments
                            const treatments = client.getTreatments?.() || {};
                            Object.entries(treatments).forEach(([key, treatment]) => {
                                if (!experiments.some(e => e.id === key)) {
                                    experiments.push({
                                        platform: 'Split.io',
                                        id: key,
                                        name: key.split(/[._-]/).map(word => 
                                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                        ).join(' '),
                                        variation: treatment,
                                        type: 'experiment',
                                        identificationMethods: [{ type: 'sdk' }]
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Error extracting Split.io treatments:', e);
                    }
                }

                // Check for Split.io in localStorage
                try {
                    const storageKeys = Object.keys(localStorage);
                    const splitKeys = storageKeys.filter(key => 
                        key.includes('split') || 
                        key.includes('SPLITIO')
                    );
                    
                    splitKeys.forEach(key => {
                        try {
                            const data = JSON.parse(localStorage.getItem(key));
                            if (data && typeof data === 'object') {
                                // Handle different Split.io storage formats
                                const treatments = data.treatments || data.splits || {};
                                Object.entries(treatments).forEach(([featureKey, value]) => {
                                    if (!experiments.some(e => e.id === featureKey)) {
                                        experiments.push({
                                            platform: 'Split.io',
                                            id: featureKey,
                                            name: featureKey.split(/[._-]/).map(word => 
                                                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                            ).join(' '),
                                            variation: typeof value === 'object' ? value.treatment || value.variant || 'Unknown' : value,
                                            type: 'feature_flag',
                                            identificationMethods: [{ type: 'localStorage' }]
                                        });
                                    }
                                });
                            }
                        } catch (e) {
                            console.error('Error parsing Split.io localStorage data:', e);
                        }
                    });
                } catch (e) {
                    console.error('Error checking Split.io localStorage:', e);
                }

                // Check for Split.io script tags and configuration
                const splitScripts = document.querySelectorAll('script[src*="split.io"], script[src*="chunk-split"]');
                splitScripts.forEach(script => {
                    const src = script.getAttribute('src');
                    if (src && !experiments.some(e => e.id === 'split_configuration')) {
                        experiments.push({
                            platform: 'Split.io',
                            id: 'split_configuration',
                            name: 'Split.io Configuration',
                            variation: 'Active',
                            type: 'configuration',
                            details: {
                                scriptSource: src
                            }
                        });
                    }
                });
            }
        } catch (e) {
            console.error('Error checking for Split.io:', e);
        }

        // Check for Optimizely in configuration objects
        try {
            // Check ICEBERG config
            if (window.ICEBERG && window.ICEBERG.trackingConfig && window.ICEBERG.trackingConfig.OPTIMIZELY) {
                const optimizelyConfig = window.ICEBERG.trackingConfig.OPTIMIZELY;
                if (optimizelyConfig.active && optimizelyConfig.optimizelySrc) {
                    console.log('Found Optimizely via ICEBERG config:', optimizelyConfig);
                    if (!detectedPlatforms.some(p => p.name === 'optimizely')) {
                        detectedPlatforms.push({
                            name: 'optimizely',
                            type: 'script',
                            source: 'ICEBERG configuration',
                            details: {
                                src: optimizelyConfig.optimizelySrc,
                                enabled: optimizelyConfig.optimizelyEnabled,
                                navigationTest: optimizelyConfig.optimizelyNavigationTestActive
                            }
                        });
                    }

                    // Try to extract project ID from the script URL
                    const projectIdMatch = optimizelyConfig.optimizelySrc.match(/\/(\d+)\.js$/);
                    if (projectIdMatch && projectIdMatch[1]) {
                        const projectId = projectIdMatch[1];
                        if (!experiments.some(e => e.id === projectId)) {
                            experiments.push({
                                platform: 'Optimizely',
                                id: projectId,
                                name: 'Optimizely Project',
                                variation: 'Active',
                                type: 'configuration',
                                details: {
                                    navigationTestActive: optimizelyConfig.optimizelyNavigationTestActive,
                                    contentPageEnabled: optimizelyConfig.optimizelyContentPageEnabled,
                                    eventPageEnabled: optimizelyConfig.optimizelyEventPageEnabled
                                }
                            });
                        }
                    }
                }
            }

            // Add a delay to wait for Optimizely to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check for Optimizely's datafile in window object
            if (window.optimizely && window.optimizely.get && window.optimizely.get('data')) {
                const data = window.optimizely.get('data');
                if (data.experiments) {
                    Object.entries(data.experiments).forEach(([expId, exp]) => {
                        if (!experiments.some(e => e.id === expId)) {
                            experiments.push({
                                platform: 'Optimizely',
                                id: expId,
                                name: exp.name || `Experiment ${expId}`,
                                variation: 'Configured',
                                type: 'experiment',
                                details: {
                                    status: exp.status,
                                    audienceIds: exp.audienceIds,
                                    variations: Object.keys(exp.variations || {})
                                }
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Error checking for Optimizely in configuration:', e);
        }

        // Check for Optimizely in window object and dataLayer
        try {
            if (typeof window.optimizely !== 'undefined') {
                console.log('Found Optimizely via window object');
                if (!detectedPlatforms.some(p => p.name === 'optimizely')) {
                    detectedPlatforms.push({
                        name: 'optimizely',
                        type: 'script',
                        source: 'window.optimizely'
                    });

                    // Try to extract Optimizely experiments
                    try {
                        if (window.optimizely.get) {
                            const state = window.optimizely.get('state');
                            if (state && state.getExperimentStates) {
                                const experimentStates = state.getExperimentStates();
                                Object.entries(experimentStates).forEach(([expId, exp]) => {
                                    if (!experiments.some(e => e.id === expId)) {
                                        experiments.push({
                                            platform: 'Optimizely',
                                            id: expId,
                                            name: exp.experimentName || `Experiment ${expId}`,
                                            variation: exp.variation || 'Unknown',
                                            type: 'experiment'
                                        });
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Error extracting Optimizely experiments:', e);
                    }
                }
            }

            // Check for Optimizely in GTM dataLayer
            if (window.dataLayer) {
                const optimizelyEvents = window.dataLayer.filter(event => 
                    event && (
                        event.optimizely_experiment_id ||
                        event.optimizely_variation_id ||
                        (event.event && event.event.includes('optimizely'))
                    )
                );

                if (optimizelyEvents.length > 0) {
                    console.log('Found Optimizely via GTM dataLayer');
                    if (!detectedPlatforms.some(p => p.name === 'optimizely')) {
                        detectedPlatforms.push({
                            name: 'optimizely',
                            type: 'script',
                            source: 'GTM dataLayer'
                        });
                    }

                    optimizelyEvents.forEach(event => {
                        if (event.optimizely_experiment_id && 
                            !experiments.some(e => e.id === event.optimizely_experiment_id)) {
                            experiments.push({
                                platform: 'Optimizely',
                                id: event.optimizely_experiment_id,
                                name: event.optimizely_experiment_name || `Experiment ${event.optimizely_experiment_id}`,
                                variation: event.optimizely_variation_name || 'Unknown',
                                type: 'experiment'
                            });
                        }
                    });
                }
            }

            // Check for Optimizely script tags
            const optimizelyScripts = document.querySelectorAll('script[src*="optimizely"]');
            if (optimizelyScripts.length > 0) {
                console.log('Found Optimizely via script tags');
                if (!detectedPlatforms.some(p => p.name === 'optimizely')) {
                    detectedPlatforms.push({
                        name: 'optimizely',
                        type: 'script',
                        source: 'script tag'
                    });
                }
            }
        } catch (e) {
            console.error('Error checking for Optimizely:', e);
        }

        // Look for JSON experiment data in script tags
        try {
            const scriptTags = document.querySelectorAll('script[type="application/json"]');
            scriptTags.forEach(script => {
                try {
                    if (script.textContent) {
                        // Check if content looks like experiment data
                        if (script.textContent.includes('"test"') || 
                            script.textContent.includes('"experiment"') ||
                            script.textContent.includes('"group"') ||
                            script.textContent.includes('"variant"')) {
                            
                            const data = JSON.parse(script.textContent);
                            if (Array.isArray(data)) {
                                data.forEach(item => {
                                    if (item.test || item.experiment) {
                                        const expId = item.test || item.experiment;
                                        if (!experiments.some(e => e.id === expId)) {
                                            experiments.push({
                                                platform: 'Unknown (Possible Eppo)',
                                                id: expId,
                                                name: expId.split(/[_-]/).map(word => 
                                                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                                ).join(' '),
                                                variation: item.group || item.variant || item.variation || 'Unknown',
                                                type: 'experiment',
                                                forced: item.forced !== undefined ? item.forced : undefined
                                            });
                                        }
                                    }
                                });
                                
                                if (experiments.length > 0 && !detectedPlatforms.some(p => p.name === 'unknown')) {
                                    detectedPlatforms.push({
                                        name: 'unknown',
                                        type: 'script',
                                        source: 'Experiment data structure detected',
                                        note: 'Found structured experiment data. Possibly Eppo or similar platform.'
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error parsing JSON script content:', e);
                }
            });
        } catch (e) {
            console.error('Error processing script tags:', e);
        }

        // Check for Convert.com in window object
        if (typeof window._conv_q !== 'undefined' || typeof window.convert !== 'undefined') {
            console.log('Found Convert.com via window object');
            if (!detectedPlatforms.some(p => p.name === 'convert')) {
                detectedPlatforms.push({
                    name: 'convert',
                    type: 'script',
                    source: 'window._conv_q or window.convert'
                });

                // Try to extract Convert.com experiments
                try {
                    if (window.convert && window.convert.currentData) {
                        const currentData = window.convert.currentData;
                        if (currentData.experiments) {
                            Object.entries(currentData.experiments).forEach(([expId, exp]) => {
                                if (!experiments.some(e => e.id === expId)) {
                                    experiments.push({
                                        platform: 'Convert.com',
                                        id: expId,
                                        name: exp.name || `Experiment ${expId}`,
                                        variation: exp.variation_name || 'Unknown',
                                        type: 'experiment'
                                    });
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error extracting Convert.com experiments:', e);
                }
            }
        }

        // Check for AB Tasty in window object
        if (typeof window._abtasty !== 'undefined' || typeof window.ABTasty !== 'undefined') {
            console.log('Found AB Tasty via window object');
            if (!detectedPlatforms.some(p => p.name === 'abtasty')) {
                detectedPlatforms.push({
                    name: 'abtasty',
                    type: 'script',
                    source: 'window._abtasty or window.ABTasty'
                });
            }
        }

        // Detect platforms using regex patterns
        Object.entries(PLATFORMS).forEach(([platform, pattern]) => {
            if (pattern.test(pageText) || pattern.test(pageSource)) {
                console.log(`Found ${platform} via pattern: ${pattern}`);
                detectedPlatforms.push({
                    name: platform,
                    type: 'detected',
                    source: pattern.toString()
                });
            }
        });

        // Extract potential experiments
        try {
            // Look for Convert.com experiment data in DOM attributes
            const convertElements = document.querySelectorAll('[data-conv-variation]');
            convertElements.forEach(element => {
                const variationId = element.getAttribute('data-conv-variation');
                const experimentId = element.getAttribute('data-conv-experiment');
                if (experimentId && !experiments.some(e => e.id === experimentId)) {
                    experiments.push({
                        platform: 'Convert.com',
                        id: experimentId,
                        name: `Experiment ${experimentId}`,
                        variation: variationId || 'Unknown',
                        type: 'experiment'
                    });
                }
            });

            // Look for script tags containing experiment data
            const scripts = pageSource.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
            scripts.forEach(script => {
                // Handle platform-specific patterns
                Object.entries(PLATFORM_EXPERIMENT_EXTRACTORS).forEach(([platform, { pattern, validate }]) => {
                    if (validate(script)) {
                        if (platform === 'convert') {
                            // Try to extract Convert.com data from script content
                            try {
                                const convertData = script.match(/convert\.currentData\s*=\s*({[^;]+})/);
                                if (convertData) {
                                    const data = JSON.parse(convertData[1]);
                                    if (data.experiments) {
                                        Object.entries(data.experiments).forEach(([expId, exp]) => {
                                            if (!experiments.some(e => e.id === expId)) {
                                                experiments.push({
                                                    platform: 'Convert.com',
                                                    id: expId,
                                                    name: exp.name || `Experiment ${expId}`,
                                                    variation: exp.variation_name || 'Unknown',
                                                    type: 'experiment'
                                                });
                                            }
                                        });
                                    }
                                }
                            } catch (e) {
                                console.error('Error parsing Convert.com data:', e);
                            }
                        } else if (platform === 'abtasty') {
                            // Try to extract AB Tasty test data
                            try {
                                const testDataMatch = script.match(/ABTastyData\s*=\s*({[^}]+})/);
                                if (testDataMatch) {
                                    const testData = JSON.parse(testDataMatch[1]);
                                    Object.entries(testData).forEach(([testId, test]) => {
                                        if (!experiments.some(e => e.id === testId)) {
                                            experiments.push({
                                                platform: 'AB Tasty',
                                                id: testId,
                                                name: test.name || `Test ${testId}`,
                                                variation: test.variationName || 'Unknown',
                                                type: 'experiment'
                                            });
                                        }
                                    });
                                }
                            } catch (e) {
                                console.error('Error parsing AB Tasty test data:', e);
                            }
                        } else {
                            const expMatch = script.match(new RegExp(pattern, 'g')) || [];
                            expMatch.forEach(match => {
                                if (platform === 'statsig') {
                                    const [name, percentage, version] = match.replace(/["']/g, '').split(':');
                                    if (!experiments.some(e => e.id === name)) {
                                        experiments.push({
                                            platform: 'Statsig',
                                            id: name,
                                            name: name.split(/(?=[A-Z])/).join(' '),
                                            variation: `${percentage}% Rollout (v${version})`,
                                            type: 'feature_gate'
                                        });
                                    }
                                } else if (platform === 'optimizely') {
                                    const expMatch = match.match(pattern);
                                    if (expMatch && !experiments.some(e => e.id === expMatch[1])) {
                                        experiments.push({
                                            platform: 'Optimizely',
                                            id: expMatch[1],
                                            name: `Experiment ${expMatch[1]}`,
                                            variation: expMatch[2],
                                            type: 'experiment'
                                        });
                                    }
                                }
                            });
                        }
                    }
                });

                // Generic experiment detection using specific patterns
                EXPERIMENT_PATTERNS.forEach(({ type, pattern }) => {
                    try {
                        const matches = safeRegexMatch(pattern, script);
                        matches.forEach(match => {
                            const id = match[1];
                            if (id && !experiments.some(e => e.id === id)) {
                                // Try to find associated variation/value
                                let variation = 'Active';
                                try {
                                    const valuePattern = new RegExp(`["']${id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}["']\\s*:\\s*["']([^"']+)["']`, 'i');
                                    const valueMatch = script.match(valuePattern);
                                    if (valueMatch) {
                                        variation = valueMatch[1];
                                    }
                                } catch (e) {
                                    console.error('Error finding variation value:', e);
                                }

                                // Try to determine the platform from the context
                                let detectedPlatform = 'Unknown';
                                for (const [platform] of Object.entries(PLATFORMS)) {
                                    const platformMatch = script.toLowerCase().includes(platform.toLowerCase());
                                    if (platformMatch && !isResourceOrMarketingMatch(platform, script)) {
                                        detectedPlatform = platform.charAt(0).toUpperCase() + platform.slice(1);
                                        // Special handling for Eppo to extract more details
                                        if (platform === 'eppo') {
                                            try {
                                                const defaultValue = script.match(/default_?value["']\s*:\s*([^,}\s]+)/);
                                                if (defaultValue) {
                                                    variation = `Default: ${defaultValue[1]}`;
                                                }
                                                
                                                const userProps = script.match(/user_?properties["']\s*:\s*({[^}]+})/);
                                                if (userProps) {
                                                    try {
                                                        const props = JSON.parse(userProps[1]);
                                                        variation += `, Properties: ${Object.keys(props).join(', ')}`;
                                                    } catch (e) {}
                                                }
                                            } catch (e) {
                                                console.error('Error extracting Eppo details:', e);
                                            }
                                        }
                                        break;
                                    }
                                }

                                // Add identification method to experiment if available
                                const platformInfo = detectedPlatforms.find(p => p.name.toLowerCase() === detectedPlatform.toLowerCase());
                                experiments.push({
                                    platform: detectedPlatform,
                                    id: id,
                                    name: id.split(/[_-]/).map(word => 
                                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                    ).join(' '),
                                    variation: variation,
                                    type: type,
                                    identificationMethods: platformInfo?.identificationMethods || null
                                });
                            }
                        });
                    } catch (e) {
                        console.error(`Error processing pattern ${pattern}:`, e);
                    }
                });
            });
        } catch (e) {
            console.error('Error extracting experiments:', e);
        }

        // Additional check for dynamically loaded Adobe Target
        try {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeName === 'SCRIPT') {
                                const src = node.src || '';
                                if (src.includes('at.js') || src.includes('mbox.js') || 
                                    src.includes('.tt.omtrdc.net')) {
                                    if (!detectedPlatforms.some(p => p.name === 'adobe')) {
                                        detectedPlatforms.push({
                                            name: 'adobe',
                                            type: 'script',
                                            source: 'Dynamically loaded Adobe Target',
                                            details: { scriptSrc: src }
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
            });
            
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            // Cleanup after 5 seconds
            setTimeout(() => observer.disconnect(), 5000);
        } catch (e) {
            console.error('Error setting up dynamic Adobe Target detection:', e);
        }

        // Inside detectExperiments function, add specific Statsig detection
        // Check for Statsig
        try {
            // Check for Statsig in window object and localStorage
            const hasStatsigWindow = typeof window.statsig !== 'undefined' || typeof window.__STATSIG_METADATA__ !== 'undefined';
            const hasStatsigStorage = localStorage.getItem('statsig_id') || localStorage.getItem('statsig_stable_id');
            
            if (hasStatsigWindow || hasStatsigStorage) {
                console.log('Found Statsig via window object or localStorage');
                if (!detectedPlatforms.some(p => p.name === 'statsig')) {
                    detectedPlatforms.push({
                        name: 'statsig',
                        type: 'script',
                        source: hasStatsigWindow ? 'window.statsig' : 'localStorage'
                    });

                    // Try to extract Statsig experiments and feature gates
                    try {
                        if (window.statsig) {
                            // Check for feature gates
                            if (window.statsig.checkGate) {
                                const gateNames = Object.keys(window.statsig._gates || {});
                                gateNames.forEach(gateName => {
                                    if (!experiments.some(e => e.id === gateName)) {
                                        experiments.push({
                                            platform: 'Statsig',
                                            id: gateName,
                                            name: gateName.split(/[._-]/).map(word => 
                                                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                            ).join(' '),
                                            type: 'feature_gate',
                                            variation: window.statsig.checkGate(gateName) ? 'true' : 'false',
                                            identificationMethods: [{ type: 'sdk' }]
                                        });
                                    }
                                });
                            }

                            // Check for experiments
                            if (window.statsig.getExperiment) {
                                const experimentNames = Object.keys(window.statsig._experiments || {});
                                experimentNames.forEach(expName => {
                                    if (!experiments.some(e => e.id === expName)) {
                                        const exp = window.statsig.getExperiment(expName);
                                        experiments.push({
                                            platform: 'Statsig',
                                            id: expName,
                                            name: expName.split(/[._-]/).map(word => 
                                                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                            ).join(' '),
                                            type: 'experiment',
                                            variation: exp?.value || 'Unknown',
                                            identificationMethods: [{ type: 'sdk' }]
                                        });
                                    }
                                });
                            }
                        }

                        // Check for Statsig metadata
                        if (window.__STATSIG_METADATA__) {
                            const metadata = window.__STATSIG_METADATA__;
                            Object.entries(metadata).forEach(([key, value]) => {
                                if (typeof value === 'object' && !experiments.some(e => e.id === key)) {
                                    experiments.push({
                                        platform: 'Statsig',
                                        id: key,
                                        name: key.split(/[._-]/).map(word => 
                                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                                        ).join(' '),
                                        type: 'configuration',
                                        variation: JSON.stringify(value),
                                        identificationMethods: [{ type: 'metadata' }]
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Error extracting Statsig experiments:', e);
                    }
                }
            }
        } catch (e) {
            console.error('Error checking for Statsig:', e);
        }

        const results = {
            platforms: detectedPlatforms,
            experiments: experiments,
            tagManagers: tagManagers,
            analyticsTools: analyticsTools,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            hasExperimentKeywords: hasExperimentKeywords
        };

        // Add note about potential experimentation if keywords found but no specific platform detected
        if (hasExperimentKeywords && detectedPlatforms.length === 0) {
            results.note = 'Experimentation keywords detected but no specific platform identified. The site might be using a custom or client-side experimentation solution.';
        }

        console.log('Detection results:', results);
        return results;
    }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Received message:', message);
        if (message.type === 'PING') {
            sendResponse('PONG');
            return true;
        }
        if (message.type === 'GET_EXPERIMENTS') {
            detectExperiments().then(results => {
                console.log('Sending response:', results);
                sendResponse({data: results});
            }).catch(error => {
                console.error('Error detecting experiments:', error);
                sendResponse({error: error.message});
            });
            return true; // Will respond asynchronously
        }
        return true;
    });

    console.log('Experiment detector content script initialized');
})(); 