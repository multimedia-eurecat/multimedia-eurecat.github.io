# Website for the Multimedia Technologies Unit at Eurecat.

This is the website of our academic research at Eurecat.	
Have a look [here](https://multimedia-eurecat.github.io/).

## How to contribute

If you plan to contribute, it is highly recommended to use [Jekyll](https://jekyllrb.com) for debugging purposes.	
So, after cloning this repo, install and run Jekyll:
```
$ git clone https://github.com/multimedia-eurecat/multimedia-eurecat.github.io.git
$ cd multimedia-eurecat.github.io
$ gem install bundler jekyll
$ bundle exec jekyll serve 
```

Then go to `http://127.0.0.1:4000/` to verify everything renders as expected.

### Important folders to contribute

- `_data`: content lists related to members, projects, publications, news, etc.
- `_posts`: the markdown posts.
- `assets/posts`: put images and other assets for each post inside a folder in this path.
- `assets/projects`: projects' logos.
- `assets/slider`: content images of the landing slider.
- `assets/team`: member avatars.

## Attribution

The site is constructed upon the original code released by the Allan Laboratory at the Leiden University. 	
Go to [here](http://www.allanlab.org/aboutwebsite.html) to learn how to copy and modify the code for your purpose. 	

The Allan's Lab thus stated:

	This website is powered by Jekyll and some Bootstrap, Bootwatch. We tried to make it simple yet adaptable, so that it is easy for you to use it as a template. Please feel free to copy and modify for your own purposes.  You don't have to link to us or mention us (but of course we appreciate it).

	Copyright Allan Lab. Code released under the MIT License.

