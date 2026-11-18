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

### MacOS instructions

If on MacOS, install Ruby via Homebrew first, then you can use gem to bundle Jekyll
```
$ brew install ruby

$ # Use Homebrew’s Ruby and gem executables in this terminal
$ export PATH="$(brew --prefix ruby)/bin:$PATH"
$ export PATH="$(ruby -r rubygems -e 'puts Gem.bindir'):$PATH"

$ gem install bundler jekyll

$ # From your Jekyll project directory
$ bundle install
$ bundle add logger
$ bundle exec jekyll serve
```

### Important folders to contribute

- `_data`: content lists related to members, projects, publications, news, etc.
- `_data/projects.yml`: projects are grouped into Current and Completed when the site builds. Set `end_date` for an exact finish date; otherwise, the final year in `date` is treated as ending on 31 December.
- `_posts`: the markdown posts.
- `assets/posts`: put images and other assets for each post inside a folder in this path.
- `assets/projects`: projects' logos.
- `assets/slider`: content images of the landing slider.
- `assets/facilities/studio` and `assets/facilities/installations`: photos for the two Facilities carousels.
- `_data/facilities_captions.yml`: selects and orders the gallery photos by exact filename. Each entry has a white `title` and an optional cyan `eyebrow` label; add `fit: contain` to show an entire image without cropping. Add new photos here to include them in a carousel.
- `_pages/facilities.md`: Facilities content, responsive SoundCloud players, and the insertion point for the next widget.
- `_data/facilities_audio.yml`: SoundCloud playlists and player height for Facilities.
- `assets/facilities/spatial-audio-widget/`: self-contained spatial audio playground embedded below the SoundCloud players. Its JavaScript module loads its own styles and audio dependencies; WAV files are processed in the visitor's browser.
- `assets/team`: member avatars.

## Attribution

The site is constructed upon the original code released by the Allan Laboratory at the Leiden University. 	
Go to [here](http://www.allanlab.org/aboutwebsite.html) to learn how to copy and modify the code for your purpose. 	

The Allan's Lab thus stated:

	This website is powered by Jekyll and some Bootstrap, Bootwatch. We tried to make it simple yet adaptable, so that it is easy for you to use it as a template. Please feel free to copy and modify for your own purposes.  You don't have to link to us or mention us (but of course we appreciate it).

	Copyright Allan Lab. Code released under the MIT License.

