import { useState, useCallback } from 'react';
import type { Config, SupportedChain } from '../types';
import { DEFAULT_CONFIG } from '../constants/config';

const generateConfigHash = (config: Config): string => {
    return `${config.testEmail}-${config.chain}-${config.serverUrl}`;
};

export const useConfiguration = () => {
    const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
    const [configHash, setConfigHash] = useState<string>(generateConfigHash(DEFAULT_CONFIG));

    const updateConfig = useCallback((updates: Partial<Config>) => {
        const newConfig = { ...config, ...updates };
        setConfig(newConfig);
        setConfigHash(generateConfigHash(newConfig));
    }, [config]);

    const updateEmail = useCallback((testEmail: string) => {
        updateConfig({ testEmail });
    }, [updateConfig]);

    const updateChain = useCallback((chain: SupportedChain) => {
        updateConfig({ chain });
    }, [updateConfig]);

    const updateServerUrl = useCallback((serverUrl: string) => {
        updateConfig({ serverUrl });
    }, [updateConfig]);

    return {
        config,
        configHash,
        updateConfig,
        updateEmail,
        updateChain,
        updateServerUrl,
    };
};