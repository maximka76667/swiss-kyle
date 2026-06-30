# Windows Dev Notes

## Port reservation fix

Hyper-V/WSL2 dynamically reserves port ranges on every boot and can block dev ports (e.g. 5173).
Fix by restricting dynamic ports to the IANA standard range (49152+). Run as admin, then reboot.

**Apply:**
```
netsh int ipv4 set dynamicport tcp start=49152 num=16384
netsh int ipv6 set dynamicport tcp start=49152 num=16384
```

**Restore:**
```
netsh int ipv4 set dynamicport tcp start=1024 num=64511
netsh int ipv6 set dynamicport tcp start=1024 num=64511
```
