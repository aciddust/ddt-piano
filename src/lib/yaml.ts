import * as yaml from 'js-yaml';

import type {
	Service,
	Deployment,
	ExternalSecret,
	Kustomization,
	Ingress,
	ServiceConfig
} from './interface';

const makeService = (deployName: string, config: ServiceConfig): Service => {
	return {
		apiVersion: 'v1',
		kind: 'Service',
		metadata: {
			name: `${config.serviceName}-${deployName}`,
			namespace: config.namespace
		},
		spec: {
			selector: {
				app: `${config.serviceName}-${deployName}`
			},
			ports: [
				{
					protocol: 'TCP',
					port: config.containerPort,
					targetPort: config.containerPort
				}
			]
		}
	};
};

const makeDeployment = (
	deployName: string,
	config: ServiceConfig,
	useKustomization: boolean
): Deployment => {
	const newImageTag = useKustomization ? `${config.imageTag.split(':')[0]}` : config.imageTag;

	return {
		apiVersion: 'apps/v1',
		kind: 'Deployment',
		metadata: {
			name: `${config.serviceName}-${deployName}`,
			namespace: config.namespace
		},
		spec: {
			replicas: config.replicas,
			revisionHistoryLimit: config.revisionHistoryLimit,
			selector: {
				matchLabels: {
					app: `${config.serviceName}-${deployName}`
				}
			},
			template: {
				metadata: {
					labels: {
						app: `${config.serviceName}-${deployName}`
					}
				},
				spec: {
					containers: [
						{
							name: `${config.serviceName}-${deployName}`,
							image: newImageTag,
							imagePullPolicy: 'Always',
							ports: [
								{
									containerPort: config.containerPort
								}
							],
							env: [
								{
									name: 'PUBLIC_FOO',
									value: 'BAR'
								},
								{
									name: 'PRIVATE_FOO',
									valueFrom: {
										secretKeyRef: {
											name: config.serviceName,
											key: 'foo'
										}
									}
								}
							]
						}
					],
					imagePullSecrets: [
						{
							name: 'registry-credentials'
						}
					]
				}
			}
		}
	};
};

const makePrivateIngress = (deployName: string, config: ServiceConfig): Ingress => {
	const subDomainByEnv =
		config.environment === 'prd' ? '' : config.environment === 'stg' ? 'stg-' : 'dev-';
	return {
		apiVersion: 'networking.k8s.io/v1',
		kind: 'Ingress',
		metadata: {
			name: `${subDomainByEnv}${config.serviceName}-private`,
			namespace: config.namespace,
			annotations: {
				'haproxy.org/ingress.class': 'haproxy'
			}
		},
		spec: {
			ingressClassName: 'haproxy',
			rules: [
				{
					host: `${config.serviceName}.d3fau1t.net`,
					http: {
						paths: [
							{
								path: '/',
								pathType: 'Prefix',
								backend: {
									service: {
										name: `${config.serviceName}-${deployName}`,
										port: {
											number: config.containerPort
										}
									}
								}
							}
						]
					}
				}
			]
		}
	};
};

const makePublicIngress = (deployName: string, config: ServiceConfig): Ingress => {
	const domainByEnv =
		config.environment === 'prd'
			? 'd3fau1t.net'
			: config.environment === 'stg'
				? 'stg.d3fau1t.net'
				: 'dev.d3fau1t.net';
	return {
		apiVersion: 'networking.k8s.io/v1',
		kind: 'Ingress',
		metadata: {
			name: `${config.serviceName}-public`,
			namespace: config.namespace,
			annotations: {
				'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
				'kubernetes.io/ingress.class': 'nginx',
				'nginx.ingress.kubernetes.io/force-ssl-redirect': 'true',
				'nginx.ingress.kubernetes.io/backend-protocol': 'HTTP',
				'nginx.ingress.kubernetes.io/rewrite-target': '/'
			}
		},
		spec: {
			ingressClassName: 'nginx',
			rules: [
				{
					host: `${config.serviceName}.${domainByEnv}`,
					http: {
						paths: [
							{
								path: '/',
								pathType: 'Prefix',
								backend: {
									service: {
										name: `${config.serviceName}-${deployName}`,
										port: {
											number: config.containerPort
										}
									}
								}
							}
						]
					}
				}
			],
			tls: [
				{
					hosts: [`${config.serviceName}.${domainByEnv}`],
					secretName: `${config.serviceName}.crt`
				}
			]
		}
	};
};

const makeExternalSecret = (deployName: string, config: ServiceConfig): ExternalSecret => {
	return {
		apiVersion: 'external-secrets.io/v1beta1',
		kind: 'ExternalSecret',
		metadata: {
			name: `${config.serviceName}-${deployName}`,
			namespace: config.namespace
		},
		spec: {
			dataFrom: [
				{
					extract: {
						key: config.externalSecretKey || 'PLEASE_PROVIDE_KEY'
					}
				}
			],
			refreshInterval: `${config.externalSecretRefreshInterval || 6}h`,
			secretStoreRef: {
				kind: 'ClusterSecretStore',
				name: 'global-awssm'
			},
			target: {
				creationPolicy: 'Owner',
				name: config.serviceName
			}
		}
	};
};

const makeKustomization = (
	configMapByDeploy: Record<string, ServiceConfig>,
	resourceFiles: string[]
): Kustomization => {
	const firstConfig = Object.values(configMapByDeploy)[0];
	const images: Array<{
		name: string;
		newTag: string;
	}> = [];

	// 각 배포항목의 이미지 정보 수집
	for (const [deployName, config] of Object.entries(configMapByDeploy)) {
		images.push({
			name: config.imageTag.split(':')[0],
			newTag: config.imageTag.split(':')[1] || 'latest'
		});
	}

	return {
		apiVersion: 'kustomize.config.k8s.io/v1beta1',
		kind: 'Kustomization',
		resources: resourceFiles,
		namespace: firstConfig?.namespace || '',
		images: images
	};
};

export const makeYAMLs = (
	configMapByDeploy: Record<string, ServiceConfig>,
	useKustomization: boolean = false
) => {
	const yamlFiles: Record<string, string> = {};
	const resourceFiles: string[] = [];
	let externalSecretCreated = false;

	for (const [deployName, config] of Object.entries(configMapByDeploy)) {
		const service = makeService(deployName, config);
		const deployment = makeDeployment(deployName, config, useKustomization);

		yamlFiles[`${deployName}/service.yaml`] = yaml.dump(service);
		yamlFiles[`${deployName}/deployment.yaml`] = yaml.dump(deployment);

		resourceFiles.push(`${deployName}/service.yaml`);
		resourceFiles.push(`${deployName}/deployment.yaml`);

		// external-secret은 최상단에 한 번만 생성
		if (!externalSecretCreated) {
			const externalSecret = makeExternalSecret(deployName, config);
			yamlFiles['external-secret.yaml'] = yaml.dump(externalSecret);
			resourceFiles.push('external-secret.yaml');
			externalSecretCreated = true;
		}

		if (config.useInternalDomain) {
			const privateIngress = makePrivateIngress(deployName, config);
			yamlFiles[`${deployName}/ingress-private.yaml`] = yaml.dump(privateIngress);
			resourceFiles.push(`${deployName}/ingress-private.yaml`);
		}

		if (config.useExternalDomain) {
			const publicIngress = makePublicIngress(deployName, config);
			yamlFiles[`${deployName}/ingress-public.yaml`] = yaml.dump(publicIngress);
			resourceFiles.push(`${deployName}/ingress-public.yaml`);
		}
	}

	// Kustomization 사용 시 kustomization.yaml 생성
	if (useKustomization) {
		const kustomization = makeKustomization(configMapByDeploy, resourceFiles);
		yamlFiles['kustomization.yaml'] = yaml.dump(kustomization);
	}

	return yamlFiles;
};
