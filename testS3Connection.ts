import { s3Client, S3_CONFIG } from './src/config/s3';
import { ListBucketsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

async function testS3Connection() {
  const output: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    output.push(msg);
  };
  
  log('Testing AWS S3 Connection...\n');
  
  try {
    // Test 1: List buckets
    log('Test 1: Verifying AWS credentials...');
    const listCommand = new ListBucketsCommand({});
    const listResponse = await s3Client.send(listCommand);
    log(`SUCCESS: AWS credentials are valid!`);
    log(`Found ${listResponse.Buckets?.length || 0} bucket(s)\n`);
    
    // Test 2: Check bucket
    log('Test 2: Checking target bucket...');
    const bucketExists = listResponse.Buckets?.some(b => b.Name === S3_CONFIG.BUCKET_NAME);
    if (bucketExists) {
      log(`SUCCESS: Bucket "${S3_CONFIG.BUCKET_NAME}" exists!\n`);
    } else {
      log(`ERROR: Bucket "${S3_CONFIG.BUCKET_NAME}" not found!`);
      log(`Available buckets: ${listResponse.Buckets?.map(b => b.Name).join(', ')}\n`);
      fs.writeFileSync('s3-test-result.txt', output.join('\n'));
      return;
    }
    
    // Test 3: Upload test file
    log('Test 3: Testing file upload...');
    const testKey = `${S3_CONFIG.FOLDER_PREFIX}/test/connection-test-${Date.now()}.txt`;
    const testContent = `AWS S3 Connection Test\nTimestamp: ${new Date().toISOString()}`;
    
    const putCommand = new PutObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain',
    });
    
    await s3Client.send(putCommand);
    log(`SUCCESS: Test file uploaded!`);
    log(`Key: ${testKey}\n`);
    
    log('ALL TESTS PASSED!');
    log(`\nConfiguration:`);
    log(`  Region: ${S3_CONFIG.REGION}`);
    log(`  Bucket: ${S3_CONFIG.BUCKET_NAME}`);
    log(`  Folder Prefix: ${S3_CONFIG.FOLDER_PREFIX}`);
    
  } catch (error: any) {
    log(`\nERROR: ${error.message}`);
    log(`Error Name: ${error.name}`);
    if (error.name === 'InvalidAccessKeyId') {
      log('The AWS Access Key ID is invalid.');
    } else if (error.name === 'SignatureDoesNotMatch') {
      log('The AWS Secret Access Key is incorrect.');
    }
  }
  
  fs.writeFileSync('s3-test-result.txt', output.join('\n'));
  log('\nResults written to s3-test-result.txt');
}

testS3Connection();
