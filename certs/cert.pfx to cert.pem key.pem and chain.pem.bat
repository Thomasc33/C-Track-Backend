openssl pkcs12 -in cert.pfx -nocerts -out key.pem -password pass:1

openssl rsa -in key.pem -out key.pem

openssl pkcs12 -in cert.pfx -clcerts -nokeys -out cert.pem -password pass:1

openssl pkcs12 -in cert.pfx -out chain.pem -nodes -password pass:1