"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.T2VApiClient = void 0;
class T2VApiClient {
    constructor(options) {
        this.baseUrl = options.baseUrl;
        this.apiKey = options.apiKey;
    }
    getBaseUrl() {
        return this.baseUrl;
    }
    buildUrl(path) {
        return new URL(path, this.baseUrl).toString();
    }
    buildHeaders(extra) {
        return {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...extra
        };
    }
    async parseJson(response) {
        try {
            return (await response.json());
        }
        catch (error) {
            throw new Error(`Failed to parse response JSON: ${error.message}`);
        }
    }
    async createVideo(request, signal) {
        const url = this.buildUrl("create");
        const response = await fetch(url, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(request),
            signal
        });
        if (!response.ok) {
            const errorPayload = await this.safeParseError(response);
            throw new Error(`T2V create failed (${response.status}): ${errorPayload}`);
        }
        return this.parseJson(response);
    }
    async getStatus(requestId, signal) {
        const url = new URL("status", this.baseUrl);
        url.searchParams.set("request_id", requestId);
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: this.buildHeaders(),
            signal
        });
        if (!response.ok) {
            const errorPayload = await this.safeParseError(response);
            throw new Error(`T2V status failed (${response.status}): ${errorPayload}`);
        }
        return this.parseJson(response);
    }
    async safeParseError(response) {
        try {
            const payload = (await response.json());
            return payload?.message ?? response.statusText;
        }
        catch (_error) {
            return response.statusText;
        }
    }
}
exports.T2VApiClient = T2VApiClient;
