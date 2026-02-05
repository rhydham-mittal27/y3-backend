# AWS S3 Environment Variables

Add the following environment variables to your `.env` file:

```env
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_S3_BUCKET_NAME=yourshikshak-uploads
AWS_S3_FOLDER_PREFIX=production
```

## How to Get AWS Credentials

### 1. Create an AWS Account
- Go to https://aws.amazon.com/
- Sign up for an AWS account if you don't have one

### 2. Create an S3 Bucket
1. Go to AWS S3 Console: https://s3.console.aws.amazon.com/
2. Click "Create bucket"
3. Enter bucket name (e.g., `yourshikshak-uploads`)
4. Choose region (e.g., `us-east-1`)
5. **Block all public access** (recommended for security)
6. Enable "Server-side encryption" (optional but recommended)
7. Click "Create bucket"

### 3. Create IAM User with S3 Access
1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click "Users" → "Add users"
3. Enter username (e.g., `yourshikshak-s3-user`)
4. Select "Access key - Programmatic access"
5. Click "Next: Permissions"
6. Click "Attach existing policies directly"
7. Search for and select `AmazonS3FullAccess` (or create a custom policy with limited permissions)
8. Click "Next" through remaining steps
9. Click "Create user"
10. **IMPORTANT**: Copy the Access Key ID and Secret Access Key (you won't be able to see the secret again!)

### 4. (Optional) Create Custom IAM Policy for Better Security
Instead of `AmazonS3FullAccess`, create a custom policy with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::yourshikshak-uploads/*",
        "arn:aws:s3:::yourshikshak-uploads"
      ]
    }
  ]
}
```

## Environment Variable Details

- **AWS_REGION**: AWS region where your S3 bucket is located (e.g., `us-east-1`, `ap-south-1`)
- **AWS_ACCESS_KEY_ID**: Access key ID from IAM user
- **AWS_SECRET_ACCESS_KEY**: Secret access key from IAM user
- **AWS_S3_BUCKET_NAME**: Name of your S3 bucket
- **AWS_S3_FOLDER_PREFIX**: Folder prefix for organizing files (e.g., `production`, `staging`, `development`)

## Security Best Practices

1. **Never commit `.env` file to version control**
2. **Use IAM roles** instead of access keys when deploying to AWS (EC2, ECS, Lambda)
3. **Rotate access keys** regularly
4. **Enable MFA** on your AWS account
5. **Use bucket policies** to restrict access
6. **Enable CloudTrail** for audit logging
7. **Set up lifecycle policies** to automatically delete old files

## Testing

After setting up the environment variables, restart your backend server and test file uploads:

1. Upload a tutor document
2. Upload a test paper
3. Upload a note file
4. Verify files appear in your S3 bucket
