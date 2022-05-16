# Step 1

Import the certificate to IIS for the front end

# Step 2

Export the certificate to `C:\Users\Administrator\Documents\GitHub\Asset-Tracking-Backend\certs` using IIS certificate manager

Use `1` as the passphrase

# Step 3

Ensure `cert.pfx` exists in `C:\Users\Administrator\Documents\GitHub\Asset-Tracking-Backend\certs`

# Step 4

Run `cert.pfx to cert.pem key.pem and chain.pem.bat`

Enter in `1111` as the passphrase when prompted

# Step 5

Reboot backend code