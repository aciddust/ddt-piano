export interface ServiceConfig {
	serviceName: string;
	environment: string;
	namespace: string;
	replicas: number;
	revisionHistoryLimit: number;
	containerPort: number;
	imageTag: string;
	useExternalDomain: boolean;
	useInternalDomain: boolean;
	externalSecretKey?: string;
	externalSecretRefreshInterval?: number;
}

export interface Deployment {
	apiVersion: string;
	kind: string;
	metadata: {
		name: string;
		namespace: string;
	};
	spec: {
		replicas: number;
		revisionHistoryLimit: number;
		selector: {
			matchLabels: {
				app: string;
			};
		};
		template: {
			metadata: {
				labels: {
					app: string;
				};
			};
			spec: {
				containers: Array<{
					name: string;
					image: string;
					imagePullPolicy: string;
					ports: Array<{
						containerPort: number;
					}>;
					env: Array<{
						name: string;
						value?: string;
						valueFrom?: {
							secretKeyRef: {
								name: string;
								key: string;
							};
						};
					}>;
				}>;
				imagePullSecrets: Array<{
					name: string;
				}>;
			};
		};
	};
}

export interface Ingress {
	apiVersion: string;
	kind: string;
	metadata: {
		name: string;
		namespace: string;
		annotations: {
			[key: string]: string;
		};
	};
	spec: {
		ingressClassName: string;
		rules: Array<{
			host: string;
			http: {
				paths: Array<{
					path: string;
					pathType: string;
					backend: {
						service: {
							name: string;
							port: {
								number: number;
							};
						};
					};
				}>;
			};
		}>;
		tls?: Array<{
			hosts: string[];
			secretName: string;
		}>;
	};
}

export interface Service {
	apiVersion: string;
	kind: string;
	metadata: {
		name: string;
		namespace: string;
	};
	spec: {
		selector: {
			app: string;
		};
		ports: Array<{
			protocol: string;
			port: number;
			targetPort: number;
		}>;
	};
}

export interface ExternalSecret {
	apiVersion: string;
	kind: string;
	metadata: {
		name: string;
		namespace: string;
	};
	spec: {
		dataFrom: Array<{
			extract: {
				key: string;
			};
		}>;
		refreshInterval: string;
		secretStoreRef: {
			kind: string;
			name: string;
		};
		target: {
			creationPolicy: string;
			name: string;
		};
	};
}

export interface Kustomization {
	apiVersion: string;
	kind: string;
	resources: string[];
	namespace: string;
	images: Array<{
		name: string;
		newTag: string;
	}>;
}

export interface ScoreNote {
	keys?: string[]; // 동시 입력 지원 (배열)
	startTime: number; // 곡 시작부터의 절대 시간 (ms)
	endTime: number; // 키를 떼는 시간 (ms)
	rest?: boolean;
}

export interface Score {
	song: string;
	bpm: number;
	notes: ScoreNote[];
	totalTime?: number; // 곡의 총 길이 (ms)
}

export interface KeyMaps {
	[instrument: string]: {
		[note: string]: string;
	};
}

export interface ProcessInfo {
	pid: number;
	name: string;
}
