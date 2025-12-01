#!/usr/bin/env bash
# Place in .platform/hooks/postdeploy directory
sudo certbot -n -d ellarises.is404.net --nginx --agree-tos --email lhenstro@byu.edu
sudo certbot -n -d intex.is404.net --nginx --agree-tos --email lhenstro@byu.edu