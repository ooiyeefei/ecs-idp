import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';

export class Bp1DefaultAccsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', { 
      vpc,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: "MyHttpNamespace",
        useForServiceConnect: true,
        type: servicediscovery.NamespaceType.HTTP,
      }
    });

    cluster.addCapacity('EcsAutoScalingGroup', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      spotInstanceDraining: true,
      allowAllOutbound: true,
      minCapacity: 1,
      maxCapacity: 5,
    });

    // Define Task Definition with Python App
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDefinition');

    taskDefinition.addContainer('sample-app', {
      memoryReservationMiB: 256,
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      portMappings: [{ 
        containerPort: 80,
        hostPort: 8080,
        protocol: ecs.Protocol.TCP
      }]
    });

    // Create Service (EC2)
    const service = new ecs.Ec2Service(this, "Service", {
      cluster,
      taskDefinition,
      // serviceConnectConfiguration: {
      //   namespace: cluster.defaultCloudMapNamespace?.namespaceName,
      // }
    });

    // Create Application Load Balancer
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
    });

    // Add listener to the Load Balancer
    const listener = lb.addListener('PublicListener', {
      port: 80,
    });

    // Attach service to the Load Balancer listener
    listener.addTargets('ECS', {
      port: 8080,
      targets: [service],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: "/",
        timeout: cdk.Duration.seconds(5),
      }
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: lb.loadBalancerDnsName, });
  }
}
